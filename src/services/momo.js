// Igice cy'ubwishyu bwa Mobile Money.
//
// ITEGEKO RY'INGENZI: iyi module NTIYOHEREZA amafaranga NYAYO. Kwimura amafaranga
// mu buryo bwikora hagati ya konti bisaba integration na MTN MoMo API (Collections/
// Disbursement) cyangwa irindi banki, ifite konti ya "Merchant"/"Business", API keys
// zemewe, na uburenganzira bwemewe na BNR (Banki Nkuru y'u Rwanda) kubera ko ari
// serivisi y'imari. Ibyo ntibishoboka gukorwa hano kandi ntibyakwiye guhimbwa.
//
// Uko application ikoresha iyi module ubu:
// 1. Buri munsi (amasaha 24), cron.js ibara 5% by'ibyagurishijwe (COMMISSION_RATE)
// 2. Sisitemu ikora "payment request" (soma nka invoice) igashyirwa muri database
//    hamwe na notification ku Admin w'ubucuruzi n'uwo yohereza commission (COMMISSION_PHONE)
// 3. Admin w'ubucuruzi yishyura ku mikono ukoresheje MoMo/telefoni ye bwite
// 4. Amaze kwishyura, yinjiza reference number + amafaranga yohereje muri
//    application (route: POST /api/payments/:id/confirm) - ibyo bigahita
//    byandikwa muri database nk'uko byasabwe
//
// Iyo ubonye API keys za MoMo Collections (ushobora kuzisaba kuri momodeveloper.mtn.com),
// ushobora guhindura function "requestMomoCollection" munsi kugira ngo yohereze
// USSD push nyayo isaba umukiriya kwemeza ubwishyu, aho gukoresha ubwishyu bw'intoki.

async function requestMomoCollection({ phone, amount, reference }) {
  const hasCredentials = process.env.MOMO_API_KEY && process.env.MOMO_API_USER;

  if (!hasCredentials) {
    console.log(`[MOMO-SIMULATED] Ntabwo MoMo API ifite credentials. Byari kwishyurwa: ${amount} RWF kuri ${phone} (ref: ${reference})`);
    return { simulated: true, status: 'manual_confirmation_required' };
  }

  // TODO: real MTN MoMo Collections API call hano, ukoresheje
  // process.env.MOMO_API_KEY, process.env.MOMO_API_USER, process.env.MOMO_SUBSCRIPTION_KEY
  console.log('[MOMO-SIMULATED - integration ntiyarangira]');
  return { simulated: true, status: 'manual_confirmation_required' };
}

module.exports = { requestMomoCollection };
