/* Reading and committing one file in the repo through GitHub's API.

   This is how the writing tool publishes a letter: it commits letters.jsx
   exactly as a push from the laptop would, so Vercel redeploys and the notify
   GitHub Action announces it - nothing downstream knows the difference.

   Needs GITHUB_TOKEN: a fine-grained token limited to this one repository,
   with "Contents: Read and write" and nothing else. */

const API = "https://api.github.com";

function repo() {
  return process.env.GITHUB_REPO || "terzievski13/love-letter";
}

function branch() {
  return process.env.GITHUB_BRANCH || "main";
}

function isConfigured() {
  return Boolean(process.env.GITHUB_TOKEN);
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "love-letter-mailbox",
  };
}

/* Thrown when someone else committed the file between our read and our write,
   so the caller can re-read and try again instead of overwriting their work. */
class ConflictError extends Error {}

/** The file's current text and its sha (which the write has to quote back). */
async function getFile(path) {
  const res = await fetch(`${API}/repos/${repo()}/contents/${path}?ref=${branch()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status} reading ${path}: ${await res.text()}`);
  const body = await res.json();
  if (typeof body.content !== "string") {
    // the contents API stops inlining files over 1 MB - years of letters away
    throw new Error(`GitHub returned no content for ${path} (is it over 1 MB?)`);
  }
  return { text: Buffer.from(body.content, "base64").toString("utf8"), sha: body.sha };
}

/** Commits new text for the file. `sha` must be the one getFile returned. */
async function putFile(path, text, sha, message) {
  const res = await fetch(`${API}/repos/${repo()}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, "utf8").toString("base64"),
      sha,
      branch: branch(),
    }),
  });
  if (res.status === 409) throw new ConflictError(`${path} changed on GitHub while saving`);
  if (!res.ok) throw new Error(`GitHub said ${res.status} saving ${path}: ${await res.text()}`);
  const body = await res.json();
  return { commit: body.commit && body.commit.sha };
}

module.exports = { isConfigured, getFile, putFile, ConflictError, repo, branch };
