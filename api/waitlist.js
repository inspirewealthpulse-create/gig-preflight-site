export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { email } = req.body;
      // TODO: integrate with a real data store or email service
      console.log('Waitlist signup:', email);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Internal error' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
