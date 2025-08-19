import Stripe from 'stripe';
import sgMail from '@sendgrid/mail';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const DOWNLOAD_LINK = process.env.DOWNLOAD_LINK;

function generateLicenceKey(tier) {
  const prefix = tier === 'pro' ? 'PRO' : 'BASIC';
  const rand = [...Array(12)].map(() => Math.random().toString(36)[2]).join('').toUpperCase();
  return `${prefix}-${rand}`;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const buf = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details && session.customer_details.email;
    const tier = (session.metadata && session.metadata.tier) || 'basic';
    const licenseKey = generateLicenceKey(tier);
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const subject = tier === 'pro' ? 'Your Gig Preflight Pro license key' : 'Your Gig Preflight Basic license key';
      const html = `
        <p>Hi,</p>
        <p>Thanks for your purchase of Gig Preflight ${tier === 'pro' ? 'Pro' : 'Basic'}!</p>
        <p>Your license key is: <strong>${licenseKey}</strong></p>
        <p>You can download the installer here: <a href="${DOWNLOAD_LINK}">${DOWNLOAD_LINK}</a></p>
        <p>If you have any questions, just reply to this email.</p>
        <p>Happy DJing,<br/>The Gig Preflight Team</p>
      `;
      const msg = {
        to: email,
        from: 'support@gigpreflight.com',
        subject,
        html,
      };
      await sgMail.send(msg);
      return res.json({ received: true });
    } catch (emailErr) {
      console.error('Error sending email:', emailErr);
      return res.status(500).send('Email sending error');
    }
  }

  return res.json({ received: true });
}
