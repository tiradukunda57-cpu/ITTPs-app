# Igitabo cy'Ubucuruzi — Business Management Platform

Application yifashishwa mu bucuruzi: umucuruzi (Admin) ashyiramo ibicuruzwa,
agurisha, akareba amafaranga yinjiye n'ibisigaye mu bubiko. Ifite roles eshatu
(Super Admin / Admin / Guest), indimi eshatu (EN/RW/FR), audit log, commission
tracking, na "AI insights". Ikora kuri telefoni na mudasobwa (responsive web app).

## Uko biteye (architecture)

- **Backend**: Node.js + Express — `server.js` na `src/`
- **Database**: dosiye ya JSON (`data/db.json`) — nta gushiraho Postgres/MySQL
  bisaba, bityo application ni **portable**: kopiya folder yose ukayishyira
  kuri computer indi, ukanakora `npm install` na `npm start`, byose bikomeza
  kuko database iri muri folder.
- **Frontend**: HTML/CSS/JS zoroheje (`public/`), nta framework igoye — iratunganye
  neza kuri telefoni (responsive) kimwe no kuri mudasobwa.
- **Auth**: JWT + bcrypt (amagambo y'ibanga ahishwa muri database, ntabwo abikwa
  mu buryo bushobora gusomwa n'ijisho).

## Gutangira kuri MacBook yawe

Ubu ubikorera bwite. Ukeneye Node.js (verisiyo 18+) yashyizweho — niba
utayifite, jya kuri https://nodejs.org ukayimanura.

```bash
cd business-app
npm install
cp .env.example .env
```

Fungura `.env` uwuzuze nibura:
- `JWT_SECRET` — jambo ry'ibanga ririnda tokens (shyiramo urutonde rw'inyuguti
  ridasanzwe/urwo wenyine uzi)
- `SUPERADMIN_PASSWORD` — iri niryo jambo ry'ibanga ryawe (Super Admin) — niba
  ridahari, konti yawe ya Super Admin ntizaremwa
- `SUPERADMIN_EMAIL` yasanzwe ari `tiradukunda57@gmail.com` (ushobora kuyihindura)

Hanyuma tangiza server:

```bash
npm start
```

Fungura browser ujye kuri **http://localhost:4000** — niyo application yawe.
Kuri telefoni iri ku wifi imwe n'iyi computer, koresha IP ya computer yawe
(urugero `http://192.168.1.12:4000`).

Injira nka Super Admin ukoresheje email na password wanditse muri `.env`.

## Uko sisitemu ikora

### Roles
- **Super Admin (wowe)**: yemeza abacuruzi (Admin) bashya mbere yuko binjira,
  arebera ubucuruzi bwose (harimo ibyasibwe), asiba/ahindura ikintu cyose,
  afunga/afungura konti, abona alert z'umutekano.
- **Admin (umucuruzi)**: yiyandikisha (ategereza kwemezwa), agenzura ibicuruzwa
  bye, agurisha, yongeramo aba Guest, abona commission yagenwe.
- **Guest**: yongerwamo n'Admin (ntiyiyandikisha ubwe). Abasha kubona
  ibicuruzwa no kwandika amagurisha, ariko ntabasha gukuraho/guhindura
  ibicuruzwa cyangwa kubona amakuru y'ubuyobozi.

### Umutekano (security)
- Amagambo y'ibanga ahishwa (bcrypt), tokens (JWT) zirangira igihe (12h).
- Iyo hari amagerageza atatu (cyangwa arenga) yo kwinjira atagenze neza mu
  minota 10, sisitemu yohereza notification (kandi SMS niba wagennye SMS
  provider) ku Super Admin n'uwo konti ye bafashe.
- Buri gikorwa (kwongeramo/gusiba/kwemeza) kiranditswe muri Audit Log.

### Commission (5% ya buri munsi)
Uko wabisobanuye:
1. Buri masaha 24, sisitemu ibara 5% by'ibyo buri bucuruzi bwagurishije
2. Ikohereza notification ku Admin n'uwo mwungirije (Super Admin), imusaba
   kwishyura ku numero `COMMISSION_PHONE` (yagenwe muri `.env`)
3. Admin amaze kwishyura (ku mikono, ukoresheje MoMo/telefoni ye bwite),
   yinjiza reference number + amafaranga yohereje muri application
4. Sisitemu igereranya amafaranga yemejwe n'ayasabwaga — niba adahuye,
   ibimenyeshwa Super Admin hamwe n'amafaranga asigaye
5. Niba Admin atemeje ubwishyu mu masaha 24, konti ye ihagarikwa
   by'agateganyo (ntabasha kwinjira) kugeza Super Admin ayifunguriye

**Icy'ingenzi ugomba kumenya**: iyi module ntiyimura amafaranga NYAYO mu buryo
bwikora hagati ya za konti. Reba `src/services/momo.js` — hasobanuwe impamvu
n'uko wakwongeramo integration nyayo ya MTN MoMo Collections API niba
ubifitiye API keys (momodeveloper.mtn.com).

### SMS
Reba `src/services/sms.js`. Nta AT_API_KEY (Africa's Talking) igenzwe muri
`.env`, SMS ntizoherezwa nyakuri — ariko ubutumwa bwose bwanditswe muri
Notifications (bugaragara kuri dashboard).

### AI Insights
Dashboard ya Admin igaragaza incamake y'ubucuruzi ikoze ku mibare (statistics).
Niba wongeyeho `ANTHROPIC_API_KEY` muri `.env`, incamake iba ari inyandiko
isobanutse (narrative) ikozwe na Claude — reba `src/services/analytics.js`.

## Gufasha abakiriya bagize ikibazo

Nka Super Admin, ujya kuri "Businesses" ukanda "View" kuri ubucuruzi ubwo
aribwo bwose kugira ngo urebe amakuru yabwo yose (harimo n'ibyasibwe). Hari
n'inzira ya "impersonate" (API: `POST /api/superadmin/impersonate/:id`) niba
ushaka kwinjira nk'uwo, kugira ngo umufashe by'umwihariko — buri gikorwa
kiranditswe muri Audit Log.

## Kohereza kuri undi muntu / indi device

Kwohereza gusa:
1. Koporora (zip) folder yose `business-app` (siba `node_modules` na
   `data/db.json` mbere niba ushaka kohereza umutwe gusa)
2. Uwakiriye akora `npm install` kuri computer ye
3. Akopiya `.env.example` akayita `.env`, akuzuza amakuru ye bwite
4. `npm start`

## Icyakorwa nyuma (production checklist)

Iyi ni MVP ikora neza ku bucuruzi buto/bwo hagati. Niba ubucuruzi bwiyongereye
cyane (abakoresha benshi cyane, amagurisha menshi ku isegonda), hindura
`src/db.js` ikoreshe database nyayo (PostgreSQL/MySQL) aho kuba JSON file, kandi
ushyireho HTTPS + hosting nyayo (aho kuba localhost) hamwe na MoMo API nyayo.
