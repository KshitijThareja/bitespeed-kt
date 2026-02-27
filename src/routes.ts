import { Router, Request, Response } from "express";
import { identifyContact } from "./identityService";
import { IdentifyRequest } from "./types";

const router = Router();

router.post("/identify", async (req: Request, res: Response) => {
  try {
    const body = req.body as IdentifyRequest;

    if (!body.email && !body.phoneNumber) {
      res.status(400).json({
        error: "Request body must contain at least one of: email, phoneNumber",
      });
      return;
    }

    const result = await identifyContact(body);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[POST /identify] Error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;