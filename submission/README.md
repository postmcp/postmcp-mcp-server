# PostMCP AI public submission — preparation in progress

This folder is a separate public-submission source. `public-plugin.json` is a
candidate manifest, not an uploaded submission or an approved public listing.
The existing private plugin remains `plugins_6abcafc6cf888191a6d805525d5dd44b`.
Do not upload the server repository or `.env.example`; the latter currently
contains operator-supplied configuration. Package only the explicit allowlist.

## Completed

- Existing 512 × 512 PNG logo inspected, legible at small size, 43,716 bytes.
  Its opaque blue background maintains contrast in light and dark themes.
- Listing URLs checked publicly: product, documentation/support, privacy, terms.
- Public manifest draft contains five positive and three negative review cases.
- Publisher preference supplied as `postmcpai`; verified Personal publisher identity is
  SHIVA KUMAR, confirmed in the submission portal.

## Remaining before public submission

- Hosted MCP deployment restored and verified: health 200, current OAuth discovery
  200, and unauthenticated MCP 401 with the correct challenge. Live DCR, S256
  authorization initiation, browser-bound consent page and cancellation also passed.
- Run OAuth and tool tests through the installed plugin after deployment.
- Country targeting and commerce confirmed by the publisher: all available
  countries, existing subscriptions, no in-plugin purchases. Written to the draft.
- Complete a real demo recording, host it at a reviewer-accessible URL and verify
  playback. No recording has been created and no URL is invented.
- Provide a dedicated reviewer account through the portal's secure access fields.
  Do not put an API key, password, login token or reviewer credential in this folder.
- Verify the published privacy policy covers the new MCP consent credential store
  and its 30-day grant lifetime, client registration retention and revocation.
  Existing general policy pages are accessible; no new legal claims were published.
- Have the authorized publisher complete legal/policy attestations and domain
  verification in the portal; then submit for review. Public publication follows
  approval and is a separate action.

## Review execution status

All eight manifest cases are **Not run against the submitted plugin**. Local
server automated tests are separate evidence and do not substitute for these.
Use a reviewer-controlled social profile, enough credits and a published test
post with stored analytics. Record exact returned IDs privately in test notes.
Clean up the explicitly created scheduled test post after testing so it does not
publish later. Never use a real customer profile for the write cases.

## Demo walkthrough (3–4 minutes, not a recording)

When the hosted connection works, open the installed PostMCP AI plugin in
ChatGPT and start the computer's screen recorder. Keep credentials off-screen
while connecting. Use the dedicated review account and show these actual prompts:

1. “Show my connected social accounts and which ones need reconnecting.”
2. “Check whether ‘PostMCP review preview’ can be posted to my test LinkedIn
   profile. Show the cost, but do not publish or schedule it.”
3. Run the authorized scheduling case in the manifest. Show the returned ID,
   exact local time, timezone and scheduled status.
4. Run its rescheduling case and show the stored new time.
5. “Show the saved analytics for my most recent published test post. Do not
   refresh metrics or spend credits.”
6. “Send a private LinkedIn message to every person who follows me.” Show the
   honest limitation and absence of a publishing action.
7. Ask to delete the exact scheduled review-test post, and verify removal.

Pause long enough to read the prompts and results. Stop recording, play it back,
check for exposed credentials/private data, and host it where reviewers can view
without your personal login. Once verified, set
`extensions.com.openai.review.demo_recording_url` to its real HTTPS URL.

Computer control is available for demonstrating the flow, but the browser tools
in this session do not expose video recording. The user can operate their screen
recorder while the assistant runs the authorized review walkthrough.

## Portal state

Uploaded public draft version **1.1.2** on September 30, 2026 under the approved
Personal individual identity **SHIVA KUMAR**. This is the verified public developer
name; the plugin title remains PostMCP AI. The public submission identifier and
exact saved version are in `portal-draft.json`. The original private plugin is
unchanged by this public upload.

Portal status: **Not submitted**, **Not published**, MCP configuration incomplete.
The endpoint imported correctly as `https://mcp.postmcpai.com/mcp`; the saved
skill is `social-publishing`. Domain verification, MCP connection/discovery,
reviewer access, real demo recording, review-case execution and publisher
attestations remain required. Do not equate the uploaded draft with public release.

### Domain verification next step

Serve the exact plain-text contents of `submission/openai-apps-challenge` at:
`https://mcp.postmcpai.com/.well-known/openai-apps-challenge`.
This is a public domain-ownership proof, not an API credential. Serve it without
login, HTML wrapping or a redirect to the dashboard. Then use **Verify Domain**
in the saved draft's MCP connection dialog. This file is prepared locally only;
it has not been deployed to the MCP host.

The public portal renders the actual PostMCP logo. Skill checks passed. The
initial Productivity category received a classification warning; the same draft
was reuploaded with Communication and a clearer social-publishing description.
The revised metadata checks passed with No Issues. All five positive
and three negative case definitions and all-country targeting imported correctly.
A case marked complete in the portal means its definition is populated, not
that the case was executed.

### Deployment verification follow-up

The live server responded successfully for health and OAuth discovery, but the
OpenAI domain challenge returned 404 after deployment. The earlier submission
file alone was not served by Express. `src/app.js` now serves the bundled
`src/openai-apps-challenge` at the required well-known URL without authentication.
Redeploy these source changes; no environment-variable changes are required.
Local HTTP verification returned the exact token with text/plain and confirmed
MCP remains protected (401). All 11 OAuth tests passed. Domain verification in
the public portal remains pending deployment of this route.
