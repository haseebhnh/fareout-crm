# Capturing leads from a public website

How to push enquiries from a marketing site (fareouttravel.com, or any
other) into OOTRIX as contacts, so a WhatsApp conversation can start
from a form fill.

Nothing needs building on the OOTRIX side — the public API already
accepts this. What follows is the contract and the one architectural
rule you must not break.

---

## The rule: never put the API key in the browser

An OOTRIX API key is **not** a publishable key. The one currently issued
to the Fareout account carries these scopes:

```
contacts:read   contacts:write   conversations:read
messages:read   messages:send    broadcasts:send    webhooks:manage
```

`messages:send` and `broadcasts:send` mean anyone holding it can send
WhatsApp messages **as your business**, to any number, at your cost. A
key pasted into front-end JavaScript is readable by every visitor via
View Source or the network tab — including bots that scrape public sites
for exactly this.

So the flow is always:

```
browser form  →  your own server  →  OOTRIX API
                 (key lives here)
```

Never:

```
browser form  →  OOTRIX API        ← key is public, account is compromised
```

If a key has ever been in client-side code, treat it as leaked: revoke
it under Settings → API keys and issue a new one.

---

## Endpoint

```
POST https://app.ootrix.com/api/v1/contacts
Authorization: Bearer <your api key>
Content-Type: application/json
```

### Body

| Field     | Required | Notes                                        |
| --------- | -------- | -------------------------------------------- |
| `phone`   | **yes**  | E.164 (`+919995689407`). The dedupe key.     |
| `name`    | no       | Contact's display name                       |
| `email`   | no       |                                              |
| `company` | no       |                                              |
| `tags`    | no       | Array of tag **names**; created if unknown   |

### Responses

| Status | Meaning                                              |
| ------ | ---------------------------------------------------- |
| `201`  | New contact created                                  |
| `200`  | Existing contact matched on phone and updated        |
| `400`  | `phone` missing, or not a valid number               |
| `401`  | Missing, malformed, revoked, or unknown key          |
| `403`  | Key lacks the `contacts:write` scope                 |

`200` vs `201` is the useful signal: it tells you whether this was a
returning enquirer. Submitting the same phone twice will not create a
duplicate — matching happens on a normalised phone, so `+91 99956 89407`
and `+919995689407` are the same person.

---

## Server-side proxy

Adapt to whatever your site runs. The shape is what matters: the key is
read from the environment, never from the request.

### Node / Next.js route handler

```js
// POST /api/enquiry  — called by your public form
export async function POST(request) {
  const form = await request.json();

  // Validate before forwarding. Your form is public; treat its input as
  // hostile, and never pass fields through blindly.
  if (!form.phone || typeof form.phone !== 'string') {
    return Response.json({ error: 'Phone is required' }, { status: 400 });
  }

  const res = await fetch('https://app.ootrix.com/api/v1/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OOTRIX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone: form.phone,
      name: form.name,
      email: form.email,
      // Tag by source so you can tell website leads from WhatsApp ones
      // in the CRM, and target them separately in broadcasts.
      tags: ['Website Lead', 'Fareout'],
    }),
  });

  if (!res.ok) {
    // Log the detail server-side; do not leak API errors to the visitor.
    console.error('OOTRIX lead capture failed:', res.status, await res.text());
    return Response.json({ error: 'Could not submit' }, { status: 502 });
  }

  return Response.json({ ok: true });
}
```

### PHP

```php
<?php
// enquiry.php
$phone = trim($_POST['phone'] ?? '');
if ($phone === '') { http_response_code(400); exit('Phone is required'); }

$ch = curl_init('https://app.ootrix.com/api/v1/contacts');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . getenv('OOTRIX_API_KEY'),
    'Content-Type: application/json',
  ],
  CURLOPT_POSTFIELDS => json_encode([
    'phone' => $phone,
    'name'  => $_POST['name'] ?? null,
    'email' => $_POST['email'] ?? null,
    'tags'  => ['Website Lead', 'Fareout'],
  ]),
]);
$body = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($code >= 400) { error_log("OOTRIX lead capture failed: $code $body"); }
http_response_code($code < 400 ? 200 : 502);
```

Set `OOTRIX_API_KEY` in the host's environment — in hPanel that is the
same **Environment variables** screen the CRM uses, under whichever site
serves the form.

---

## Verifying it works

```bash
curl -i -X POST https://app.ootrix.com/api/v1/contacts \
  -H "Authorization: Bearer $OOTRIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919995689407","name":"Test Lead","tags":["Website Lead"]}'
```

Expect `201` the first time and `200` after. The contact appears
immediately under **Contacts** in OOTRIX, tagged `Website Lead`.

Settings → API keys shows a **last used** timestamp — the quickest way
to confirm a live site is actually reaching the API rather than failing
silently.

---

## Turning a lead into a conversation

Creating a contact does not message anyone. To follow up automatically:

1. Build an automation with the `Website Lead` tag as its condition.
2. Add a `send_template` action — templates are required, because a
   business-initiated message outside the 24-hour window cannot be
   free-form.
3. The template must be **approved by Meta**, and the account needs a
   **payment method**. Without billing, Meta accepts the send and then
   fails delivery, which surfaces as `status: failed` on the message.
