const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

interface MediaContainerResponse {
  id: string;
}

interface PublishResponse {
  id: string;
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
