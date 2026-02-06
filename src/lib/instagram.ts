const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

interface MediaContainerResponse {
  id: string;
}

interface PublishResponse {
  id: string;
}

// Check if we're in dry-run mode (for testing without Instagram credentials)
function isDryRun(): boolean {
  return process.env.DRY_RUN === "true";
}

// Create a media container (step 1 of posting)
async function createMediaContainer(
  imageUrl: string,
  caption: string
): Promise<string> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;

  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption,
        access_token: accessToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create media container: ${JSON.stringify(error)}`);
  }

  const data: MediaContainerResponse = await response.json();
  return data.id;
}

// Publish the media container (step 2 of posting)
async function publishMedia(containerId: string): Promise<string> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;

  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to publish media: ${JSON.stringify(error)}`);
  }

  const data: PublishResponse = await response.json();
  return data.id;
}

// Main function: Post image to Instagram
export async function postToInstagram(imageUrl: string, caption: string) {
  // DRY RUN MODE: Simulate success without calling Instagram API
  if (isDryRun()) {
    const fakeMediaId = `dry-run-${Date.now()}`;
    console.log("[DRY RUN] Simulating Instagram post:");
    console.log(`  - Image URL: ${imageUrl}`);
    console.log(`  - Caption: ${caption}`);
    console.log(`  - Fake Media ID: ${fakeMediaId}`);
    
    // Simulate a small delay like the real API would have
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    return { mediaId: fakeMediaId, dryRun: true };
  }

  // LIVE MODE: Actually post to Instagram
  // Step 1: Create media container
  const containerId = await createMediaContainer(imageUrl, caption);

  // Step 2: Wait a moment for processing (Instagram recommends this)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 3: Publish
  const mediaId = await publishMedia(containerId);

  return { mediaId };
}

// Verify credentials are working
export async function verifyInstagramConnection() {
  // In dry-run mode, return mock account info
  if (isDryRun()) {
    console.log("[DRY RUN] Simulating Instagram connection verification");
    return {
      username: "dry_run_test_account",
      name: "Dry Run Test Account",
      dryRun: true,
    };
  }

  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN!;

  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}?fields=username,name&access_token=${accessToken}`
  );

  if (!response.ok) {
    throw new Error("Failed to verify Instagram connection");
  }

  return response.json();
}

// Check if dry-run mode is enabled (exported for use in API responses)
export function isDryRunEnabled(): boolean {
  return isDryRun();
}
