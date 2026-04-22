const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Imap = require('imap');

// ─── SMTP: Send Email ─────────────────────────────────────────────────────────
router.post('/smtp/send', async (req, res) => {
  const { host, port, secure, user, password, to, subject, body } = req.body;
  if (!host || !user || !password || !to || !subject)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port) || 587,
      secure: secure === true || secure === 'true',
      auth: { user, pass: password },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
    const info = await transporter.sendMail({
      from: user, to, subject,
      text: body,
      html: `<div style="font-family:sans-serif">${body.replace(/\n/g, '<br>')}</div>`,
    });
    res.json({ success: true, message: 'Email sent via SMTP', messageId: info.messageId, protocol: 'SMTP' });
  } catch (err) {
    res.status(500).json({ error: `SMTP Error: ${err.message}` });
  }
});

// ─── IMAP: Fetch Inbox ────────────────────────────────────────────────────────
router.post('/imap/inbox', async (req, res) => {
  const { host, port, user, password, tls } = req.body;
  if (!host || !user || !password)
    return res.status(400).json({ error: 'Missing required fields' });

  const imap = new Imap({
    user, password, host,
    port: parseInt(port) || 993,
    tls: tls !== false,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 10000, authTimeout: 10000,
  });
  const emails = [];
  const done = (err) => {
    if (err) return res.status(500).json({ error: `IMAP Error: ${err.message}` });
    res.json({ success: true, protocol: 'IMAP', count: emails.length, emails: emails.slice(0, 10) });
  };
  imap.once('error', done);
  imap.once('ready', () => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) { imap.end(); return done(err); }
      const total = box.messages.total;
      if (total === 0) { imap.end(); return res.json({ success: true, protocol: 'IMAP', count: 0, emails: [] }); }
      const start = Math.max(1, total - 9);
      const fetch = imap.seq.fetch(`${start}:${total}`, { bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'] });
      fetch.on('message', (msg) => {
        const email = {};
        msg.on('body', (stream) => {
          let buffer = '';
          stream.on('data', chunk => buffer += chunk.toString('utf8'));
          stream.on('end', () => {
            const parsed = Imap.parseHeader(buffer);
            email.from = parsed.from?.[0] || '';
            email.subject = parsed.subject?.[0] || '(no subject)';
            email.date = parsed.date?.[0] || '';
          });
        });
        msg.once('end', () => emails.push(email));
      });
      fetch.once('error', (err) => { imap.end(); done(err); });
      fetch.once('end', () => imap.end());
    });
  });
  imap.once('end', () => { if (!res.headersSent) done(null); });
  imap.connect();
});

// ─── POP3: Check Mailbox ──────────────────────────────────────────────────────
router.post('/pop3/check', async (req, res) => {
  const { host, port, user, password } = req.body;
  if (!host || !user || !password)
    return res.status(400).json({ error: 'Missing required fields' });

  const tls = require('tls');
  const net = require('net');
  const pop3Port = parseInt(port) || 995;
  const useTLS = pop3Port === 995;

  let socket, buffer = '', done = false;
  const emails = [];
  let state = 'CONNECT', messageList = [], currentMsg = 0;

  const finish = (err) => {
    if (done) return; done = true;
    try { socket.destroy(); } catch (_) {}
    if (err) return res.status(500).json({ error: `POP3 Error: ${err}` });
    res.json({ success: true, protocol: 'POP3', count: messageList.length, emails });
  };
  const send = (cmd) => { try { socket.write(cmd + '\r\n'); } catch (_) {} };

  const handleLine = (line) => {
    if (line.startsWith('-ERR')) return finish(`Server error: ${line}`);
    if (state === 'CONNECT' && line.startsWith('+OK')) { state = 'AUTH_USER'; send(`USER ${user}`); }
    else if (state === 'AUTH_USER' && line.startsWith('+OK')) { state = 'AUTH_PASS'; send(`PASS ${password}`); }
    else if (state === 'AUTH_PASS' && line.startsWith('+OK')) { state = 'LIST'; send('LIST'); }
    else if (state === 'LIST') {
      if (line.startsWith('+OK')) { state = 'LIST_RESULT'; }
      else if (line === '.') {
        if (!messageList.length) return finish(null);
        messageList = messageList.slice(-5);
        state = 'TOP'; currentMsg = 0;
        send(`TOP ${messageList[0].id} 5`);
      } else {
        const p = line.split(' ');
        if (p.length >= 2) messageList.push({ id: p[0] });
      }
    } else if (state === 'LIST_RESULT') {
      if (line === '.') {
        if (!messageList.length) return finish(null);
        messageList = messageList.slice(-5);
        state = 'TOP'; currentMsg = 0;
        send(`TOP ${messageList[0].id} 5`);
      } else {
        const p = line.split(' ');
        if (p.length >= 2) messageList.push({ id: p[0] });
      }
    } else if (state === 'TOP') {
      if (line === '.') {
        currentMsg++;
        if (currentMsg < messageList.length) send(`TOP ${messageList[currentMsg].id} 5`);
        else { send('QUIT'); finish(null); }
      } else {
        if (!emails[currentMsg]) emails[currentMsg] = { from: '', subject: '', date: '' };
        if (line.toLowerCase().startsWith('from:')) emails[currentMsg].from = line.slice(5).trim();
        if (line.toLowerCase().startsWith('subject:')) emails[currentMsg].subject = line.slice(8).trim();
        if (line.toLowerCase().startsWith('date:')) emails[currentMsg].date = line.slice(5).trim();
      }
    }
  };

  try {
    socket = useTLS
      ? tls.connect(pop3Port, host, { rejectUnauthorized: false })
      : net.connect(pop3Port, host);
    socket.setTimeout(15000);
    socket.on('timeout', () => finish('Connection timed out'));
    socket.on('error', (e) => finish(e.message));
    socket.on('data', (data) => {
      buffer += data.toString();
      let lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) if (line) handleLine(line);
    });
  } catch (err) { finish(err.message); }
});

module.exports = router;
