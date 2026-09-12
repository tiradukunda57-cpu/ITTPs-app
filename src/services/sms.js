// Igice cyo kohereza SMS.
// Niba AT_USERNAME na AT_API_KEY (Africa's Talking) bitanditswemo muri .env,
// SMS ntizohererezwa nyakuri - zizajya zandikwa gusa muri log na notifications
// table kugirango ubone ubutumwa n'ubwo hataba SMS nyayo yoherejwe.
//
// Kwongeramo provider nyayo (Africa's Talking, Twilio, n'ibindi):
// 1. Kora konti kuri provider ushaka
// 2. Shyira API key muri .env
// 3. Uzuza fetch call munsi aho handitse "TODO: real SMS API call"

async function sendSMS(phone, message) {
  const hasCredentials = process.env.AT_USERNAME && process.env.AT_API_KEY;

  if (!hasCredentials) {
    console.log(`[SMS-SIMULATED] Kuri ${phone}: ${message}`);
    return { simulated: true, phone, message };
  }

  // TODO: real SMS API call (urugero Africa's Talking REST API) ukoresheje
  // process.env.AT_USERNAME na process.env.AT_API_KEY
  console.log(`[SMS-SIMULATED - integration ntiyarangira] Kuri ${phone}: ${message}`);
  return { simulated: true, phone, message };
}

module.exports = { sendSMS };
