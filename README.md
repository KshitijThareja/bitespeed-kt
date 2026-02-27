# BiteSpeed Identity Reconciliation API

A web service designed to reconcile customer contact information. It links multiple purchases or interactions made with different emails and phone numbers to the same customer profile. Hope this helps Doc Brown :)

## Live Demo

**Deployment URL:** [https://bitespeed-kt.onrender.com/](https://bitespeed-kt.onrender.com/)

---

## Tech Stack

- **Runtime Environment:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Database:** PostgreSQL (Supabase)

---

## Environment Variables

To run this project locally, create a `.env` file in the root directory and configure the following variables:

```ini
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/bitespeed
NODE_ENV=development
BASE_URL=http://localhost:3000
```

---

## Local Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run in Development Mode:**
   ```bash
   npm run dev
   ```

3. **Build for Production:**
   ```bash
   npm run build
   ```

4. **Start Production Server:**
   ```bash
   npm start
   ```

---

## API Endpoints

### 1. Identify Contact
Reconciles and links customer identities based on email or phone number.

- **URL:** `/identify`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "email": "janedoe@example.com",
    "phoneNumber": "1234567890"
  }
  ```
- **Success Response:**
  - **Code:** `200 OK`
  - **Content:**
    ```json
    {
      "contact": {
        "primaryContatctId": 1,
        "emails": ["janedoe@example.com"],
        "phoneNumbers": ["1234567890"],
        "secondaryContactIds": [2, 3]
      }
    }
    ```

### 2. Health Check
Verifies if the API is up and running.

- **URL:** `/health`
- **Method:** `GET`
- **Success Response:**
  - **Code:** `200 OK`
  - **Content:**
    ```json
    {
      "status": "ok",
      "timestamp": "2024-02-27T12:00:00.000Z"
    }
    ```
