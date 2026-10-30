# Club pages — content from cpsconline.com, restyled in the membership site's theme.
# exec()'d at the end of build.py, so page(), HEAD etc. are in scope.
import json as _json
_SZ = _json.load(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'image-sizes.json')))

def img(name, alt, cls='', lazy=True):
    w, h = _SZ[name]
    return (f'<img src="img/site/{name}.webp" alt="{alt}" width="{w}" height="{h}"'
            + (f' class="{cls}"' if cls else '') + (' loading="lazy" decoding="async"' if lazy else '') + '>')

def bg(name):
    return f'style="background-image:url(img/site/{name}.webp)"'

EXT = 'target="_blank" rel="noopener"'
BIG_TRIP_SIGNUP = 'https://outsidelifegw.com/Register/2116/CopperJan18232027CentralPacificSkiClub/Spruill/SLOCPSC2027/Sophiecspruill29@gmail.com'
IKON_SIGNUP = 'https://outsidelifegw.com/Register/1978/IkonPassSale20262027/Spruill/SLOSophieSpruill2026/Sophiecspruill29@gmail.com'
PAY_URL = 'https://cpsconline.com/join/'

CLUB_JS = r'''
boot('public').catch(() => {});
// Tap a flyer to see it big
const lb = document.getElementById('lightbox');
if (lb) {
  const big = lb.querySelector('img');
  document.querySelectorAll('.gallery button').forEach((b) => b.onclick = () => {
    const i = b.querySelector('img'); big.src = i.src; big.alt = i.alt; lb.hidden = false; lb.focus();
  });
  lb.onclick = () => { lb.hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.hidden = true; });
}
// Events that already happened switch to "past"
document.querySelectorAll('[data-ends]').forEach((el) => {
  if (Date.now() > Date.parse(el.dataset.ends)) el.classList.add('is-past');
});
'''
LIGHTBOX = '<div class="lightbox" id="lightbox" hidden tabindex="-1" role="dialog" aria-label="Flyer"><img alt=""></div>'

def club(fname, title, body, script=''):
    page(fname, title, '', body, CLUB_JS + script, main_class='club', suffix='Central Pacific Ski Club')
    if fname == 'home.html':
        # The site root: Home for visitors, straight to your card if you're logged in
        page('index.html', title, ROOT_REDIRECT, body, CLUB_JS + script, main_class='club', suffix='Central Pacific Ski Club')

ROOT_REDIRECT = '''<script>try { if (Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k))) location.replace(localStorage.getItem('cpsc-role') === 'admin' ? 'scan.html' : 'card.html'); } catch (e) {}</script>'''

def band(words):
    seq = ''.join(f'<span>{w}</span>' for w in words)
    return f'<div class="band" aria-hidden="true"><div>{seq}{seq}</div></div>'

BAND = band(['Live to ski, love to party', 'Est. 1941', 'San Luis Obispo', 'All levels welcome', 'Big Trip 2027 · Copper, CO', 'See you on the slopes (or the boat)'])

def cta_member():
    return '''<section class="sec tight"><div class="wrap"><div class="cta-band">
  <div><h2>Already a <em>member?</em></h2><p>Your digital membership card lives in Apple Wallet or Google Wallet.</p></div>
  <div class="btn-row" style="margin:0"><a class="btn lime lg" href="card.html">My card</a><a class="btn ghost lg" style="color:#fff;border-color:#fff" href="join.html">Join CPSC</a></div>
</div></div></section>'''

# ---------------- Home ----------------
club('home.html', 'Home', f'''
<section class="home-banner">{img('home-hero', 'Welcome to Central Pacific Ski Club — members celebrating in the snow', lazy=False)}</section>
<section class="home-intro"><div class="wrap">
  <h1>Live to ski, love to party</h1>
  <p>Whether you’re sending cliffs or just learning to ski, we’re here to bring together everyone who shares a love for skiing, snowboarding, and having a good time.</p>
  <div class="btn-row"><a class="btn lg" href="join.html">Become a member</a><a class="btn ghost lg" href="events.html">Events</a></div>
</div></section>
{BAND}
<section class="sec"><div class="wrap split">
  <div class="prose">
    <div class="kicker">Who we are</div>
    <h2 class="big">Your people.<br>Powder days.</h2>
    <p>We’re proud to be one of the largest social clubs in San Luis Obispo, where our goal is to build community through unforgettable trips, weekly events, and a shared passion for skiing and partying. CPSC is run by an executive board of 10 members, putting together the best events and membership experience.</p>
    <p>Every winter break, we send a legendary week-long trip to some awesome resorts — past destinations include Jackson Hole, Steamboat, and Big Sky. During Winter (Spring Semester), we keep the stoke alive with smaller trips to places like Oregon, Tahoe, Mammoth, and Utah.</p>
    <p>But the fun doesn’t stop when the snow melts. Spring means it’s time for our annual spring skiing trip and houseboating. As well as our awesome spring trips, we host weekly events throughout the year to keep everyone connected and excited about ski club. We take pride in being super inclusive — all levels are welcome, and we’re always welcoming and encouraging new members!</p>
    <p><strong>If you’re looking for your people, powder days, and your best college memories, you’ve found the right place. See you on the slopes (or the boat)!</strong></p>
    <div class="btn-row"><a class="btn" href="about.html">About us</a><a class="btn ghost" href="events.html">Events</a></div>
  </div>
  {img('home-graphic', 'CPSC skier mid-air', 'rounded')}
</div></section>
<section class="sec lime tight"><div class="wrap">
  <div class="stats">
    <div><b>1941</b><span>Founded</span></div>
    <div><b>1,000+</b><span>Snow lovers</span></div>
    <div><b>7–8</b><span>Trips every year</span></div>
    <div><b>#2</b><span>Largest collegiate ski club in the nation</span></div>
  </div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="kicker">Happening now</div>
  <h2 class="big">What’s on</h2>
  <div class="tiles">
    <a class="tile" href="big-trip.html" {bg('copper')}><small>Jan 18–23 · $799</small><strong>Big Trip 2027</strong><span>Copper, CO for Powdaze</span></a>
    <a class="tile" href="ikon.html" {bg('group-snow-2')}><small>2026/27 · On sale</small><strong>Ikon Pass</strong><span>Discounted through CPSC</span></a>
    <a class="tile" href="events.html" {bg('beach')}><small>Fall · Winter · Spring</small><strong>Events</strong><span>Parties, small trips, daygers & houseboating</span></a>
    <a class="tile" href="sponsors.html" {bg('hostel-1')}><small>2026–2027</small><strong>Sponsors</strong><span>The brands that keep us sending</span></a>
  </div>
</div></section>
{cta_member()}
''')

# ---------------- About ----------------
club('about.html', 'About', f'''
<section class="club-hero" {bg('group-snow-2')}>
  <div class="wrap">
    <div class="kicker">About</div>
    <h1>What is <em>CPSC?</em></h1>
    <p>Founded in 1941 — now the second-largest collegiate ski club in the nation.</p>
  </div>
</section>
{BAND}
<section class="sec"><div class="wrap split">
  <div class="prose">
    <div class="kicker">Since 1941</div>
    <h2 class="big">Chasing powder &amp; a ridiculously good time</h2>
    <p>Founded in 1941, the Central Pacific Ski Club (CPSC) has grown into the second-largest collegiate ski club in the nation! CPSC brings together over a thousand snow lovers who are all about chasing powder and having a ridiculously good time, on and off the mountain. Whether you’re here to send it on the slopes or attend the best parties, you’ll find your people with us.</p>
    <p>Every year, we hit the road for 7–8 trips to some of the best mountains in the country — think Tahoe, Utah, Colorado, and more. Whether you’re all about first chair on a powder day or just in it for the après, there’s a spot for you on all our trips.</p>
  </div>
  {img('group-snow', 'CPSC members together on the mountain', 'rounded')}
</div></section>
<section class="sec lime tight"><div class="wrap">
  <div class="stats">
    <div><b>1941</b><span>Founded</span></div>
    <div><b>1,000+</b><span>Members</span></div>
    <div><b>7–8</b><span>Trips a year</span></div>
    <div><b>10</b><span>Exec board members</span></div>
  </div>
</div></section>
<section class="sec dark"><div class="wrap">
  <div class="cards">
    <div class="card season"><div class="num">01</div><div class="tag">Our members</div><h3>Who are we?</h3>
      <p>The heart and soul of our club are our members. No other club in the area has such a diverse membership base composed of so many amazing people with different backgrounds and unique talents. Ski Club has a legendary event calendar, and between fall parties, our annual BIG TRIP, small trip season, spring dayges, spring skiing and houseboating, we have something for everyone! No reason to be board when you can join Central Pacific Ski Club!</p></div>
    <div class="card season"><div class="num">02</div><div class="tag">Everyone</div><h3>Who can join?</h3>
      <p>Everyone! Seriously. CPSC welcomes all skill levels, from first-timers to seasoned pros, and even those who just want to come along for the good times, killer events, and community. The best part about CPSC is the diversity of our members. We accept anyone and everyone with an interest in snow sports regardless of skill level, or even interest in snow sports for that matter. We can’t wait to meet you!</p></div>
  </div>
  <div class="btn-row" style="justify-content:center;margin-top:32px"><a class="btn lime lg" href="join.html">Join now</a></div>
</div></section>
{cta_member()}
''')

# ---------------- Events ----------------
GALLERY = [('flyer-copper-2027', 'Big Trip 2027 — Copper Mountain'), ('flyer-red-mountain', 'Big Trip 2025 — Red Mountain, BC'),
           ('flyer-camping-rave', 'Halloween Camping Rave'), ('flyer-snowbird', 'Small Trip — Snowbird'), ('flyer-tahoe', 'Trip Two — Palisades Tahoe'),
           ('flyer-mammoth', 'Last small trip — Mammoth'), ('flyer-houseboating', 'Houseboating is back'), ('flyer-steamboat', 'Steamboat Springs'),
           ('flyer-utah', 'Small Trip — Utah'), ('flyer-squallywood', 'Small Trip — Squallywood'), ('flyer-tahoe-2', 'Small Trip — Tahoe'),
           ('flyer-beach-dayge', 'Beach Dayge'), ('flyer-beanies-bikinis', 'Beanies & Bikinis'), ('flyer-80s-aspen', "80s in Aspen")]
gallery_html = ''.join(f'<button type="button" aria-label="Open flyer: {t}">{img(n, t)}</button>' for n, t in GALLERY)

club('events.html', 'Events', f'''
<section class="club-hero" {bg('beach')}>
  <div class="wrap">
    <div class="kicker">Events</div>
    <h1>Every season,<br><em>all year</em></h1>
    <p>Fall parties, the Big Trip, small trip season, spring dayges, spring skiing and houseboating.</p>
    <div class="chips"><span class="chip on">Fall</span><span class="chip">Winter</span><span class="chip">Spring</span></div>
  </div>
</section>
<section class="sec"><div class="wrap">
  <div class="kicker">Fall 2026</div>
  <h2 class="big">Camping Rave</h2>
  <div class="ticket" data-ends="2026-10-25T12:00:00-07:00">
    <div class="date"><b>OCT 23–24</b><span>Fri → Sat</span></div>
    <div class="what"><h3>Fall Camping Rave · Pozo</h3><p>For one night only! We camp, we rave, we wake up (eventually). Spend the night with your fellow ski club members and AWESOME live DJs.</p><p class="past-note">This one’s in the books — see you at the next one.</p></div>
    <div class="price"><b>$8.69</b><span class="fine">Sign-ups opened Oct 18</span></div>
  </div>
  <dl class="qa" style="margin-top:34px">
    <div><dt>Who?</dt><dd>All CPSC members are welcome!</dd></div>
    <div><dt>What?</dt><dd>We will be raving, but we are also camping so bring a tent (dinner and some snacks provided).</dd></div>
    <div><dt>When?</dt><dd>Friday, October 23rd to Saturday, October 24th.</dd></div>
    <div><dt>Where?</dt><dd>Pozo (exact coordinates dropped closer to the date).</dd></div>
    <div><dt>How?</dt><dd>Don’t worry if you don’t have a car — you get a rideshare link in your trip sign-up confirmation.</dd></div>
    <div><dt>Why?</dt><dd>Because we will have live DJs and it’s an AWESOME time!</dd></div>
  </dl>
</div></section>
{BAND}
<section class="sec dark"><div class="wrap">
  <div class="kicker">The year at CPSC</div>
  <h2 class="big">Three seasons of sending</h2>
  <div class="cards">
    <div class="card season"><div class="num">01</div><div class="tag">Fall semester</div><h3>Fall</h3>
      <p>There’s no better way to kick off a new school year than with a classic Ski Club rager. You can look forward to a party every weekend of Fall semester, courtesy of your Central Pacific Ski Club membership. Fall is a great way to get to know your fellow members and the exec board in typical ski club fashion — with the music blasting and a drink in hand. Expect DJs, kegs, and enough jungle juice to go around. From our WOW week activities to our legendary Halloween party, the Executive Board solemnly swears you will not get bored this Fall.</p>
      <div class="dest"><span>WOW week</span><span>Weekly parties</span><span>Halloween</span><span>Camping Rave</span></div></div>
    <div class="card season"><div class="num">02</div><div class="tag">Winter break + spring semester</div><h3>Winter</h3>
      <p>The heart and soul of our club lives in the Winter season. We host our annual Big Trip during the LAST week of winter break, starting the ski season off with a BANG. Picture the most fun ski trip you’ve ever been on, multiply the fun by 69 and make it a week long — that’s basically our Big Trip. After that, we have four small trips every other week throughout the spring semester. These trips are WILD, and we wouldn’t miss them for the world. Fair warning: if you are not prepared to leave the mountain with 50 new best friends, then you shouldn’t come.</p>
      <div class="dest"><span>Big Trip</span><span>Alta · Snowbird · Brighton</span><span>Palisades Tahoe</span><span>Mt. Bachelor</span><span>Mammoth</span></div></div>
    <div class="card season"><div class="num">03</div><div class="tag">Spring semester</div><h3>Spring</h3>
      <p>Come spring, when the sun is shining and the birdies are chirping, our dayger season begins. Almost every weekend brings a new dayge, beach day, die tourney, and if the snow is good… SPRING SKIING! Spring is also home to our fabled houseboating trip — a weekend getting boozy and groovy with your fellow senders, and one of the coolest trips of the year. By the end of spring semester our official events come to a close, and we hope to see everyone again next school year!</p>
      <div class="dest"><span>Dayges</span><span>Beach days</span><span>Die tourney</span><span>Spring skiing</span><span>Houseboating</span></div></div>
  </div>
  <div class="btn-row"><a class="btn lime lg" href="big-trip.html">Big Trip 2027 →</a></div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="kicker">Throwback</div>
  <h2 class="big">Our past events &amp; trips</h2>
  <p class="lead" style="margin-bottom:26px">Tap a flyer to see it full size.</p>
  <div class="gallery">{gallery_html}</div>
</div></section>
{LIGHTBOX}
{cta_member()}
''')

# ---------------- Big Trip ----------------
club('big-trip.html', 'Big Trip 2027', f'''
<section class="club-hero" {bg('copper')}>
  <div class="wrap">
    <div class="kicker">Big Trip 2027</div>
    <h1>Copper, CO<br><em>Powdaze</em></h1>
    <p>Get ready for the sickest week of your life — 5 days and nights of nonstop skiing and partying with the sickest ski club in California!</p>
    <div class="chips"><span class="chip on">Jan 18–23, 2027</span><span class="chip">$799</span><span class="chip">5 days / 5 nights</span></div>
  </div>
</section>
<section class="sec"><div class="wrap">
  <div class="ticket">
    <div class="date"><b>JAN 18–23</b><span>2027</span></div>
    <div class="what"><h3>Copper Mountain · Powdaze</h3><p>5 days/nights of skiing, lodging, and activities. Sign-ups opened Tuesday, September 29th at 7PM PST.</p></div>
    <div class="price"><b>$799</b><a class="btn" href="{BIG_TRIP_SIGNUP}" {EXT}>Sign up ↗</a></div>
  </div>
  <div class="split" style="margin-top:56px">
    <div>
      <div class="kicker">What you get</div>
      <h2 class="big">5 days/nights of skiing, lodging &amp; activities</h2>
      <ul class="checks"><li>Events hosted by CPSC</li><li>Parties every night</li><li>Soooo much skiing</li><li>Lodging for the whole week</li></ul>
      <div class="btn-row"><a class="btn lg" href="{BIG_TRIP_SIGNUP}" {EXT}>Click here to sign up ↗</a></div>
    </div>
    {img('flyer-copper-2027', 'Big Trip 2027 flyer: Copper Mountain, Jan 18–23, $799', 'rounded')}
  </div>
</div></section>
<section class="sec tight"><div class="wrap"><div class="cards">
  {img('group-snow', 'CPSC on a past Big Trip', 'rounded')}{img('copper', 'Copper Mountain', 'rounded')}{img('group-snow-2', 'CPSC group photo in the snow', 'rounded')}
</div></div></section>
{band(['Big Trip 2027', 'Copper, CO', 'Powdaze', 'Jan 18–23', '$799', 'Parties every night'])}
<section class="sec dark"><div class="wrap">
  <div class="kicker">Past Big Trip · 2025</div>
  <h2 class="big">Red Mountain, BC — CPSC went international</h2>
  <div class="split">
    <div class="prose">
      <p>For the very first time, CPSC went INTERNATIONAL. From December 13–20, 2025 we sent it up north for five full days of skiing in CANADA, with an entire hostel rented out walking distance from the mountain, hostel parties and nights out at local bars (where the drinking age is only 19). Our cheapest Big Trip ever, and easily the most unforgettable.</p>
      <p>Round-trip bus transportation was included — the bus ride isn’t just a way to get there, it’s part of the Big Trip experience — with a Non-Bus option for anyone arranging their own ride.</p>
    </div>
    {img('flyer-red-mountain', 'Big Trip 2025 flyer: Red Mountain, Dec 13–20, $699', 'rounded')}
  </div>
  <h3 style="font-size:2rem;margin:48px 0 14px;color:#fff">Our home for the week</h3>
  <div class="cards">{img('hostel-1', 'Nowhere Special Hostel exterior', 'rounded')}{img('hostel-2', 'Hostel lounge', 'rounded')}{img('hostel-3', 'Hostel kitchen and dining room', 'rounded')}</div>
  <dl class="qa" style="margin-top:44px">
    <div><dt>Who?</dt><dd>Your fellow CPSC friends and the 2025/26 executive board, with a full hostel reserved just for us.</dd></div>
    <div><dt>What?</dt><dd>Five straight days of skiing at Red Mountain, then après, bar outings and hostel parties.</dd></div>
    <div><dt>When?</dt><dd>December 13th–20th, 2025 — prime winter season, right before the holidays.</dd></div>
    <div><dt>Where?</dt><dd>Red Mountain, British Columbia — incredible terrain, welcoming ski culture and a lively après scene.</dd></div>
    <div><dt>Price?</dt><dd>$699.69 with lodging, the bus across the border, food and drink and all the events — or $550.59 without the bus.</dd></div>
  </dl>
</div></section>
<section class="sec"><div class="wrap">
  <div class="kicker">Good to know</div>
  <h2 class="big">Big Trip policies</h2>
  <p class="lead" style="margin-bottom:22px">From the 2025 trip — check the sign-up page for this year’s exact terms.</p>
  <div class="notes">
    <details open><summary>Refunds</summary><p>Because CPSC must cover large prepaid expenses to secure housing, transportation, and other logistics, refunds cannot be offered for any reason. If you need to cancel after reserving your spot, the only way to avoid losing your payment is if a waitlisted person takes your place or you find a replacement traveler. Otherwise, your spot and payment are forfeited.</p></details>
    <details><summary>Deposits &amp; payment deadlines</summary><p>In 2025, a $99 deposit secured a place at registration (or you could pay in full), with the $600 balance due by November 15th through Venmo or PayPal. Missing the deadline meant losing the spot and the deposit, and the deposit option closed October 15th.</p></details>
    <details><summary>Passports &amp; border crossing</summary><p>For international trips you must have a valid, non-expired passport by departure. If you are denied entry for any reason — including intoxication, missing documentation, criminal record, or possession of illegal substances — you are responsible for getting yourself home, without a refund. CPSC is not liable for lost or stolen passports or documents.</p></details>
    <details><summary>Rules, damages &amp; safety</summary><p>All attendees are expected to follow both club rules and house rules. You are personally responsible for any damage you cause and will pay in full for anything you break. CPSC isn’t responsible for your personal belongings. Illegal substances are strictly prohibited and can mean immediate removal from the trip without a refund. CPSC is not liable for accidents, injury, or illness during the trip, but medical treatment will be provided if necessary.</p></details>
  </div>
</div></section>
''')

# ---------------- Ikon Pass ----------------
club('ikon.html', 'Ikon Pass', f'''
<section class="club-hero short" {bg('group-snow-2')}>
  <div class="wrap">
    <div class="kicker">Ikon Pass 2026/2027</div>
    <h1>Ikon Pass<br><em>now on sale</em></h1>
    <p>Our discounted Ikon Pass for 2026–2027 is NOW ON SALE. Get yours through CPSC today!</p>
    <div class="btn-row"><a class="btn lime lg" href="{IKON_SIGNUP}" {EXT}>2026/2027 Ikon Pass ↗</a></div>
  </div>
</section>
<section class="sec"><div class="wrap split">
  <div>
    <div class="kicker">Member deal</div>
    <h2 class="big">Discounted through CPSC</h2>
    <p class="lead">Lock in the 2026–2027 Ikon Pass at the club rate before it’s gone. Big Trip 2027 at Copper is an Ikon mountain, so your pass gets plenty of use.</p>
    <ul class="checks"><li>Club-discounted price for the 2026/27 season</li><li>Buy online through our booking partner</li><li>Ride with CPSC all winter</li></ul>
    <div class="btn-row"><a class="btn lg" href="{IKON_SIGNUP}" {EXT}>Get your pass ↗</a><a class="btn ghost lg" href="big-trip.html">Big Trip 2027</a></div>
  </div>
  {img('ikon-banner', 'Ikon Pass — sign up now, 2026-2027 passes on sale', 'rounded')}
</div></section>
{cta_member()}
''')

# ---------------- Sponsors ----------------
SPONSORS = [('jskis', 'J Skis', 'https://jskis.com/'), ('nivis', 'Nivis', 'https://www.nivisgear.com/'), ('rmu', 'RMU', 'https://mtnculture.com/'),
  ('qp', 'QP Supplements', 'https://quickpumpenergy.com/'), ('sunbum', 'Sun Bum', 'https://www.sunbum.com/'), ('woodstocks', 'Woodstocks', 'https://woodstocksslo.com/'),
  ('truck', 'Truck', 'https://www.truckgloves.com/'), ('numbskull', 'Numbskull', 'https://numbskull.co/'), ('senger', 'Senger', 'https://sengerco.com/'),
  ('pitviper', 'Pit Viper', 'https://www.pitviper.com/'), ('louisas', 'Louisa’s Place', 'https://www.louisasplace.com/'), ('playa', 'Playa Wipes', 'https://playawipes.com'),
  ('gopro', 'GoPro', 'https://gopro.com/en/us/'), ('oldslobbq', 'Old SLO BBQ', 'https://oldsanluisbbq.com/'), ('ryno', 'Ryno Power', 'https://rynopower.com/'),
  ('turtlebox', 'Turtlebox', 'https://turtleboxaudio.com/'), ('skullcandy', 'Skullcandy', 'https://www.skullcandy.com/'), ('ogio', 'OGIO', 'http://www.ogiopowersports.com/'),
  ('sliceoflife', 'Slice of Life', 'https://www.sliceoflifecreations.com/'), ('wook', 'Wook Plugs', 'https://wookplugs.com/'), ('brode', 'Brode', 'https://brode.co/'),
  ('psi', 'Party Shirt Intl.', 'https://partyshirtinternational.com/'), ('barkk', 'Barkk', 'https://www.barkkmag.com'), ('rone', 'Rone', 'https://www.ronenutrition.com/CPSC25'),
  ('makescents', 'Make Scents', 'https://makescents.co/'), ('skal', 'SKÅL', 'https://skalgloves.com/')]
sponsor_html = ''.join(f'<a class="sponsor" href="{u}" {EXT}><div class="logo">{img("logo-"+k, n+" logo")}</div><div class="nm">{n}</div></a>' for k, n, u in SPONSORS)

club('sponsors.html', 'Sponsors', f'''
<section class="sec dark" style="padding-bottom:40px"><div class="wrap split">
  <div>
    <div class="kicker">2026–2027 season</div>
    <h1 class="big" style="color:#fff;font-size:clamp(3.4rem,10vw,6rem)">Our <span style="color:var(--lime)">sponsors</span></h1>
    <p class="lead">Check out our sponsors for the 2026–2027 season! Members get dozens of exclusive discount codes from these awesome brands.</p>
    <div class="btn-row"><a class="btn lime" href="#list">See all {len(SPONSORS)}</a><a class="btn ghost" style="color:#fff;border-color:#fff" href="tel:+14158272210">Become a sponsor</a></div>
  </div>
  {img('sponsors-banner', 'CPSC Membership Sponsors 2026–2027', 'rounded', lazy=False)}
</div></section>
{band([n for _, n, _ in SPONSORS[:12]])}
<section class="sec" id="list"><div class="wrap">
  <div class="sponsor-grid">{sponsor_html}</div>
</div></section>
<section class="sec tight"><div class="wrap"><div class="cta-band">
  <div><h2>Want to <em>sponsor</em> CPSC?</h2><p>Reach 1,000+ members across San Luis Obispo. Reach out to Scott at (415) 827-2210.</p></div>
  <a class="btn lime lg" href="tel:+14158272210">Call Scott</a>
</div></div></section>
''')

# ---------------- Join ----------------
PAY_JS = r'''
// ----- Paying dues online (Stripe Checkout) -----
(async () => {
  const form = $('#payForm'); if (!form || !window.FN_URL) return;
  const qs = new URLSearchParams(location.search);
  const plan = () => form.querySelector('input[name=plan]:checked')?.value;
  let info = null;
  const upd = () => { if (info?.prices) $('#payBtn').textContent = 'Pay ' + money(info.prices[plan()]); };
  const pick = (v) => { const r = form.querySelector(`input[value="${v}"]`); if (r && !r.disabled) { r.checked = true; upd(); } };
  form.addEventListener('change', upd);
  try { info = await (await fetch(FN_URL + '?prices=1')).json(); } catch (e) {}
  const sid = qs.get('paid');
  if (!info?.ready && !sid) { form.hidden = true; $('#payLead').hidden = true; $('#payOff').hidden = false; return; }
  if (info?.prices) {
    for (const k of ['new', 'returning', 'spring']) form.querySelector(`[data-price="${k}"]`).textContent = money(info.prices[k]);
    $('#payUntil').textContent = `Every membership is valid through ${info.until} — the end of the school year.`;
    if (!info.springOpen) {
      const sp = $('#springPlan'); sp.classList.add('off'); sp.querySelector('input').disabled = true;
      sp.querySelector('small').textContent = 'Sold January–May';
    }
    upd();
  }
  // Logged in? Fill in their details and assume they're renewing
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const { data: p } = await sb.from('profiles').select('name,email').eq('id', session.user.id).maybeSingle();
      if (p) { $('#payName').value = p.name; $('#payEmail').value = p.email; pick('returning'); }
    }
  } catch (e) {}
  if (qs.has('renew')) pick('returning');
  if (qs.has('canceled')) showMsg($('#payMsg'), 'Payment canceled — nothing was charged.');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#payName').value.trim(), email = $('#payEmail').value.trim();
    if (name.length < 2) return showMsg($('#payMsg'), 'Type your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showMsg($('#payMsg'), 'Type a valid email.');
    $('#payBtn').disabled = true; $('#payBtn').textContent = 'Opening secure checkout…'; $('#payMsg').className = 'msg';
    try {
      const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'checkout', plan: plan(), name, email, returnUrl: location.href.split(/[?#]/)[0] }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'Couldn’t start checkout. Try again in a minute.');
      location.href = d.url;
    } catch (err) { showMsg($('#payMsg'), err.message); $('#payBtn').disabled = false; upd(); }
  };

  // Back from Stripe: confirm the payment and show the next step
  if (sid) {
    const done = $('#payDone');
    form.hidden = true; done.hidden = false; done.innerHTML = '<p class="lead">Confirming your payment…</p>';
    document.getElementById('pay').scrollIntoView();
    let d = null;
    for (let i = 0; i < 6 && !d?.paid; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1500));
      try { const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'checkout-status', session: sid }) }); d = await r.json(); } catch (e) {}
    }
    if (d?.paid) {
      const first = esc((d.name || '').split(' ')[0] || 'friend');
      done.innerHTML = `<div class="pay-ok" aria-hidden="true">✓</div><h3>You’re in, ${first}!</h3>
        <p class="lead">Your membership is paid and valid through <b>${esc(d.until)}</b>.</p>` + (d.hasAccount
        ? `<a class="btn lime lg" href="card.html?renewed=1">See my card</a><p class="fine">Your wallet card updates on its own — no need to re-add it.</p>`
        : `<p>Last step: create your account with <b>${esc(d.email)}</b> to get your membership card.</p>
           <a class="btn lime lg" href="signup.html?email=${encodeURIComponent(d.email)}&name=${encodeURIComponent(d.name || '')}">Create my account</a>`);
      history.replaceState(null, '', location.pathname + '#pay');
    } else {
      done.innerHTML = '<p class="lead">We couldn’t confirm your payment yet. If you were charged, refresh this page in a minute — or show your Stripe receipt to the exec board.</p>';
    }
  }
})();
'''

club('join.html', 'Join', f'''
<section class="club-hero short" {bg('group-snow')}>
  <div class="wrap">
    <div class="kicker">Membership 2026–2027</div>
    <h1>Get <em>sendy</em></h1>
    <p>Ok, you’ve sold me — but how do I join? Awesome, we are beyond excited to have you!</p>
  </div>
</section>
<section class="sec"><div class="wrap">
  <div class="kicker">One-time fee · whole school year</div>
  <h2 class="big">Membership</h2>
  <div class="prices">
    <div class="price-card hot"><div class="tag">New members</div><b>$55.69</b><p>Good for the entire 2026–2027 school year.</p></div>
    <div class="price-card"><div class="tag">Returning members</div><b>$50.69</b><p>Welcome back — same perks, lower price.</p></div>
    <div class="price-card"><div class="tag">Spring membership</div><b>$25.69</b><p>Resets before fall — you’d pay the full-year fee again next fall.</p></div>
  </div>
  <div class="split" style="margin-top:48px;align-items:start">
    <div>
      <h3 style="font-size:2rem;margin:0 0 4px">Every membership includes</h3>
      <ul class="checks"><li>A CPSC 2026–2027 membership shirt</li><li>Dozens of exclusive discount codes from our <a href="sponsors.html">sponsors</a></li><li>Access to every party, small trip and the Big Trip</li><li>Your digital membership card in Apple Wallet or Google Wallet</li></ul>
      <p class="lead" style="margin-top:18px">Thanks so much for joining our club and get ready for an awesome year of partying, skiing and debauchery!</p>
    </div>
    <div class="card">
      <div class="tag">How to join</div>
      <ol class="steps">
        <li><span>1</span><div><strong>Pay your dues online</strong><br>Card, Apple Pay or Google Pay — right below.</div></li>
        <li><span>2</span><div><strong>You’re approved instantly</strong><br>Paying adds your email to the member list.</div></li>
        <li><span>3</span><div><strong>Create your account</strong><br>Sign up here with that email and add a photo.</div></li>
        <li><span>4</span><div><strong>Add your card to your wallet</strong><br>Show the QR at the door to check in.</div></li>
      </ol>
      <div class="btn-row"><a class="btn lg" href="#pay">Pay &amp; join</a><a class="btn ghost lg" href="signup.html">Create account</a></div>
    </div>
  </div>
  <p class="fine" style="margin-top:36px">*Please note that membership fees are not refundable. You are responsible for attending events and getting the most out of your membership.<br>
  *If you are paying our spring membership fee ($25.69), please note our membership resets before fall. If you wish to still be a member the following fall, you must pay for the full-priced, full-year membership when it is reset.</p>
</div></section>
<section class="sec dark pay-sec" id="pay" data-noedit><div class="wrap">
  <div class="kicker">Pay online</div>
  <h2 class="big" style="color:#fff">Pay your <span style="color:var(--lime)">dues</span></h2>
  <p class="lead" id="payLead">Card, Apple Pay or Google Pay. You’re approved the moment it goes through — then create your account and add your card to your wallet.</p>
  <div class="pay-done" id="payDone" hidden aria-live="polite"></div>
  <form class="pay-form" id="payForm" novalidate>
    <fieldset class="plans"><legend class="sr">Membership</legend>
      <label class="plan"><input type="radio" name="plan" value="new" checked><span><b>New member</b><em data-price="new">$55.69</em><small>Full school year</small></span></label>
      <label class="plan"><input type="radio" name="plan" value="returning"><span><b>Returning member</b><em data-price="returning">$50.69</em><small>Full school year</small></span></label>
      <label class="plan" id="springPlan"><input type="radio" name="plan" value="spring"><span><b>Spring</b><em data-price="spring">$25.69</em><small>Spring semester</small></span></label>
    </fieldset>
    <div class="pay-fields">
      <div><label for="payName">Full name</label><input id="payName" type="text" autocomplete="name" required maxlength="80"></div>
      <div><label for="payEmail">Email</label><input id="payEmail" type="email" autocomplete="email" required spellcheck="false" autocapitalize="none"></div>
    </div>
    <p class="fine" id="payUntil">Every membership is valid through June 30, the end of the school year.</p>
    <button class="btn lime lg block" type="submit" id="payBtn">Pay $55.69</button>
    <div class="msg" id="payMsg"></div>
    <p class="fine">Payments are handled by Stripe — your card details never touch this site. Use the email you’ll sign up with (returning members: the one you joined with before).</p>
  </form>
  <div class="pay-off" id="payOff" hidden><p class="lead">Online payment is coming soon. For now, pay on cpsconline.com and an exec board member will approve you.</p>
    <a class="btn lime lg" href="{PAY_URL}" {EXT}>Pay on cpsconline.com ↗</a></div>
</div></section>
''', PAY_JS)

# ---------------- Exec Board (members only; content lives in Supabase) ----------------
page('exec-board.html', 'Exec Board', '', '''
<section class="sec dark exec-top"><div class="wrap">
  <div class="kicker">Members only · 2026/2027</div>
  <h1 class="big" style="color:#fff;font-size:clamp(3.2rem,10vw,6rem)">Get to know your <span style="color:var(--lime)">exec board</span></h1>
  <p class="lead">Ten people running the best events and membership experience in SLO. Tap a photo to see it big.</p>
  <nav class="chips" id="jump" aria-label="Board members" data-noedit></nav>
</div></section>
<div class="wrap" id="importBox" hidden data-noedit>
  <div class="notice" style="margin-top:24px"><strong>Exec board photos aren’t loaded yet</strong>
  As an admin you can copy them from cpsconline.com into the private members-only storage (one time, about 30 seconds).
  <div class="btn-row" style="margin-top:10px"><button class="btn" id="importBtn" type="button">Import photos</button><span class="muted" id="importMsg"></span></div></div>
</div>
<section class="sec"><div class="wrap" id="board" data-noedit><p class="muted center">Loading the board…</p></div></section>
<div class="lightbox" id="lightbox" hidden tabindex="-1" role="dialog" aria-label="Photo"><img alt=""></div>
''', r'''
boot('member').then(async ({ profile }) => {
  const { data: rows, error } = await sb.from('exec_board').select('*').order('sort');
  window.execBoard = { rows: rows || [] };   // the admin editor saves changes back to these rows
  if (error || !rows?.length) { $('#board').innerHTML = '<p class="muted center">Couldn’t load the exec board right now.</p>'; return; }
  const paths = rows.flatMap((r) => r.photos);
  const { data: signed } = await sb.storage.from('club').createSignedUrls(paths, 3600);
  const url = {}; (signed || []).forEach((s) => { if (s.signedUrl && !s.error) url[s.path] = s.signedUrl; });
  const missing = paths.filter((p) => !url[p]).length;
  $('#jump').innerHTML = rows.map((r) => `<a class="chip" href="#m${r.sort}">${esc(r.name)}</a>`).join('');
  $('#board').innerHTML = rows.map((r, i) => `
    <article class="exec ${i % 2 ? 'flip' : ''}" id="m${r.sort}" data-id="${r.id}">
      <div class="exec-photos">${r.photos.map((p, j) => url[p]
        ? `<button type="button" data-photo="${j}" aria-label="${esc(r.name)} photo ${j + 1}"><img src="${url[p]}" alt="${esc(r.name)}, ${esc(r.role)}" loading="lazy"></button>`
        : `<div class="ph" data-photo="${j}" aria-hidden="true">${esc(r.name[0])}</div>`).join('')}</div>
      <div class="exec-text">
        <div class="kicker" data-db="role">${esc(r.role)}</div>
        <h2><i data-db="name">${esc(r.name)}</i> <span>aka “<i data-db="nickname">${esc(r.nickname || '')}</i>”</span></h2>
        <p data-db="bio">${esc(r.bio || '')}</p>
      </div>
    </article>`).join('');
  const lb = $('#lightbox'), big = lb.querySelector('img');
  document.querySelectorAll('.exec-photos button').forEach((b) => b.onclick = () => { big.src = b.querySelector('img').src; lb.hidden = false; lb.focus(); });
  lb.onclick = () => { lb.hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.hidden = true; });

  // One-time admin import: copy the photos from cpsconline.com into the private bucket
  if (missing && profile.is_admin) {
    $('#importBox').hidden = false;
    $('#importBtn').onclick = async () => {
      $('#importBtn').disabled = true;
      let done = 0, failed = 0; const todo = rows.flatMap((r) => r.photos.map((p, j) => [p, r.photo_sources[j]])).filter(([p, s]) => s && !url[p]);
      for (const [path, src] of todo) {
        try {
          const blob = await (await fetch(src)).blob();
          const bmp = await createImageBitmap(blob);
          const k = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
          const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          const out = await new Promise((res) => c.toBlob(res, 'image/webp', 0.82));
          const { error } = await sb.storage.from('club').upload(path, out, { upsert: true, contentType: 'image/webp' });
          if (error) throw error; done++;
        } catch (e) { failed++; console.warn(path, e); }
        $('#importMsg').textContent = `${done + failed} / ${todo.length}${failed ? ` (${failed} failed)` : ''}`;
      }
      $('#importMsg').textContent = failed ? `${failed} photos failed — try again.` : 'Done! Reloading…';
      if (!failed) setTimeout(() => location.reload(), 800); else $('#importBtn').disabled = false;
    };
  }
}).catch(() => {});
''', main_class='club', suffix='Central Pacific Ski Club')
