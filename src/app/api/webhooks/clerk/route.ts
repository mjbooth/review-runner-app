import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { type WebhookEvent } from '@clerk/nextjs/server';
import { getOrCreateUser, updateUser } from '@/services/users';

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occurred -- no svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your webhook secret
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return new Response('Server configuration error', { status: 500 });
  }

  const wh = new Webhook(webhookSecret);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occurred', {
      status: 400,
    });
  }

  // Handle the webhook event
  const eventType = evt.type;
  console.log(`Clerk webhook received: ${eventType}`, {
    userId: evt.data.id,
    timestamp: new Date().toISOString(),
  });

  try {
    switch (eventType) {
      case 'user.created':
      case 'user.updated': {
        const { id, email_addresses, first_name, last_name, image_url } = evt.data;

        // Get primary email
        const primaryEmail = email_addresses.find(e => e.id === evt.data.primary_email_address_id);
        if (!primaryEmail) {
          console.error('No primary email found for user');
          return NextResponse.json({ error: 'No primary email' }, { status: 400 });
        }

        // Create or update user in database
        // For new users created with email/password, first_name/last_name will be null
        // They'll be collected and updated during onboarding
        const user = await getOrCreateUser({
          clerkUserId: id,
          email: primaryEmail.email_address,
          firstName: first_name || null,
          lastName: last_name || null,
          imageUrl: image_url || null,
        });

        console.log(
          `User ${eventType === 'user.created' ? 'created' : 'updated'} successfully: ${id}`
        );
        break;
      }

      case 'user.deleted': {
        // For now, we'll keep the user record for audit purposes
        // but you could soft-delete or handle differently
        console.log(`User deleted event received for: ${evt.data.id}`);
        // Could mark user as inactive or handle deletion
        break;
      }

      case 'session.created': {
        // Update last active timestamp when user signs in
        const { user_id } = evt.data;
        if (user_id) {
          await updateUser(user_id, { lastActiveAt: new Date() });
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 });
  }
}

// Clerk webhooks only use POST
export async function GET() {
  return NextResponse.json({ message: 'Clerk webhook endpoint' });
}
