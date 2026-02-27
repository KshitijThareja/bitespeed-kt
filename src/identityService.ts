import { PoolClient } from "pg";
import pool from "./db";
import { Contact, IdentifyRequest, IdentifyResponse } from "./types";

/**
 * Fetch all contacts matching the given email or phoneNumber.
 */
async function findMatchingContacts(
  client: PoolClient,
  email: string | null | undefined,
  phoneNumber: string | null | undefined
): Promise<Contact[]> {
  const conditions: string[] = [];
  const values: (string | null)[] = [];

  if (email) {
    values.push(email);
    conditions.push(`email = $${values.length}`);
  }
  if (phoneNumber) {
    values.push(phoneNumber);
    conditions.push(`"phoneNumber" = $${values.length}`);
  }

  if (conditions.length === 0) return [];

  const query = `
    SELECT * FROM "Contact"
    WHERE (${conditions.join(" OR ")})
    AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
  `;

  const result = await client.query<Contact>(query, values);
  return result.rows;
}

/**
 * Given a list of contacts, fetch the full cluster:
 * all contacts that share the same primary root.
 */
async function fetchFullCluster(
  client: PoolClient,
  contacts: Contact[]
): Promise<Contact[]> {
  if (contacts.length === 0) return [];

  const primaryIds = new Set<number>();
  for (const c of contacts) {
    if (c.linkPrecedence === "primary") {
      primaryIds.add(c.id);
    } else if (c.linkedId !== null) {
      primaryIds.add(c.linkedId);
    }
  }

  const idArray = Array.from(primaryIds);
  const result = await client.query<Contact>(
    `
    SELECT * FROM "Contact"
    WHERE (id = ANY($1) OR "linkedId" = ANY($1))
    AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    `,
    [idArray]
  );

  return result.rows;
}

/**
 * Create a new primary contact.
 */
async function createPrimaryContact(
  client: PoolClient,
  email: string | null | undefined,
  phoneNumber: string | null | undefined
): Promise<Contact> {
  const result = await client.query<Contact>(
    `
    INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt")
    VALUES ($1, $2, NULL, 'primary', NOW(), NOW(), NULL)
    RETURNING *
    `,
    [email ?? null, phoneNumber ?? null]
  );
  return result.rows[0];
}

/**
 * Create a new secondary contact linked to the given primary.
 */
async function createSecondaryContact(
  client: PoolClient,
  email: string | null | undefined,
  phoneNumber: string | null | undefined,
  primaryId: number
): Promise<Contact> {
  const result = await client.query<Contact>(
    `
    INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence", "createdAt", "updatedAt", "deletedAt")
    VALUES ($1, $2, $3, 'secondary', NOW(), NOW(), NULL)
    RETURNING *
    `,
    [email ?? null, phoneNumber ?? null, primaryId]
  );
  return result.rows[0];
}

/**
 * Demote a primary contact to secondary, pointing it to newPrimaryId.
 */
async function demoteToSecondary(
  client: PoolClient,
  contactId: number,
  newPrimaryId: number
): Promise<void> {
  await client.query(
    `
    UPDATE "Contact"
    SET "linkPrecedence" = 'secondary',
        "linkedId" = $1,
        "updatedAt" = NOW()
    WHERE id = $2
    `,
    [newPrimaryId, contactId]
  );
}

/**
 * Reassign all secondaries of oldPrimaryId to point to newPrimaryId.
 */
async function reassignSecondaries(
  client: PoolClient,
  oldPrimaryId: number,
  newPrimaryId: number
): Promise<void> {
  await client.query(
    `
    UPDATE "Contact"
    SET "linkedId" = $1,
        "updatedAt" = NOW()
    WHERE "linkedId" = $2
    AND "deletedAt" IS NULL
    `,
    [newPrimaryId, oldPrimaryId]
  );
}

/**
 * Build the final response payload from a full cluster of contacts.
 */
function buildResponse(
  allContacts: Contact[],
  primaryId: number
): IdentifyResponse {
  const primary = allContacts.find((c) => c.id === primaryId)!;
  const secondaries = allContacts.filter((c) => c.id !== primaryId);

  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const secondaryContactIds: number[] = [];

  if (primary.email) emails.push(primary.email);
  if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);

  for (const c of secondaries) {
    secondaryContactIds.push(c.id);
    if (c.email && !emails.includes(c.email)) emails.push(c.email);
    if (c.phoneNumber && !phoneNumbers.includes(c.phoneNumber))
      phoneNumbers.push(c.phoneNumber);
  }

  return {
    contact: {
      primaryContatctId: primaryId,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

/**
 * Main identify logic.
 */
export async function identifyContact(
  body: IdentifyRequest
): Promise<IdentifyResponse> {
  const email = body.email?.trim() || null;
  const phoneNumber = body.phoneNumber?.trim() || null;

  if (!email && !phoneNumber) {
    throw new Error("At least one of email or phoneNumber must be provided.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Step 1: Find all directly matching contacts
    const matched = await findMatchingContacts(client, email, phoneNumber);

    if (matched.length === 0) {
      const newContact = await createPrimaryContact(client, email, phoneNumber);
      await client.query("COMMIT");
      return buildResponse([newContact], newContact.id);
    }

    // Step 2: Fetch full cluster for all matched contacts
    let cluster = await fetchFullCluster(client, matched);

    // Step 3: Find all distinct primaries in the cluster
    const primaries = cluster.filter((c) => c.linkPrecedence === "primary");

    let truePrimary: Contact;

    if (primaries.length > 1) {
      primaries.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      truePrimary = primaries[0];

      for (let i = 1; i < primaries.length; i++) {
        const loser = primaries[i];
        await reassignSecondaries(client, loser.id, truePrimary.id);
        await demoteToSecondary(client, loser.id, truePrimary.id);
      }

      cluster = await fetchFullCluster(client, [truePrimary]);
    } else {
      truePrimary = primaries[0];
    }

    // Step 4: Check if the incoming request has new information
    const existingEmails = new Set(
      cluster.map((c) => c.email).filter(Boolean)
    );
    const existingPhones = new Set(
      cluster.map((c) => c.phoneNumber).filter(Boolean)
    );

    const hasNewEmail = email && !existingEmails.has(email);
    const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

    if (hasNewEmail || hasNewPhone) {
      const secondary = await createSecondaryContact(
        client,
        email,
        phoneNumber,
        truePrimary.id
      );
      cluster.push(secondary);
    }

    await client.query("COMMIT");
    return buildResponse(cluster, truePrimary.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}