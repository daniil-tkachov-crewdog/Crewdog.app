// server/constants/notEmployerHosts.js
//
// The hosts that are never a hiring company's own website, used by
// isEmployerSite() to tell a company's own career page from an advert it
// placed somewhere else.

// Hosts that are never the hiring company's own website. Two kinds, and the
// second is the one worth being explicit about: a vacancy on
// equinix.wd1.myworkdayjobs.com or boards.greenhouse.io/<company> is the
// employer's own advert in the sense that the application lands on their desk,
// but it is NOT their career page — it is recruitment software they rent, on
// somebody else's domain, and the candidate can see that in the URL. The direct
// group means the company's own site, so everything here is excluded from it.
//
// A blocklist, not an allowlist, because the employer's domain is whatever the
// employer owns and cannot be enumerated. An unknown platform therefore slips
// through as "direct" until it is named here; the search prompt is the first
// line of defence and this is the backstop.
export const NOT_EMPLOYER_HOSTS = [
  // Applicant tracking systems and hosted careers sites.
  "greenhouse.io", "lever.co", "myworkdayjobs.com", "myworkdaysite.com", "workday.com",
  "smartrecruiters.com", "teamtailor.com", "workable.com", "ashbyhq.com", "icims.com",
  "jobvite.com", "bamboohr.com", "recruitee.com", "personio.de", "personio.com",
  "breezy.hr", "pinpointhq.com", "jazzhr.com", "applytojob.com", "avature.net",
  "phenompeople.com", "eightfold.ai", "csod.com", "cornerstoneondemand.com",
  "brassring.com", "silkroad.com", "hirebridge.com", "catsone.com", "clearcompany.com",
  "dayforcehcm.com", "ultipro.com", "paylocity.com", "paycomonline.net", "adp.com",
  "rippling.com", "gohire.io", "occupop.com", "peoplehr.net", "tribepad.com",
  "networxrecruitment.com", "jobtrain.co.uk", "eploy.co.uk", "vacancy-filler.co.uk",
  "webrecruit.co.uk", "hireful.co.uk", "tal.net", "isolvedhire.com", "polymer.co",
  "jobs.jobvite.com", "recruiterbox.com", "hrmdirect.com", "snaphunt.com",
  // Boards, aggregators and professional networks.
  "linkedin.com", "totaljobs.com", "reed.co.uk", "cv-library.co.uk", "jobserve.com",
  "jobsite.co.uk", "cwjobs.co.uk", "technojobs.co.uk", "irishjobs.ie", "jobs.ie",
  "simplyhired.com", "careerbuilder.com", "dice.com", "xing.com", "infojobs.net",
  "welcometothejungle.com", "otta.com", "wellfound.com", "angel.co", "builtin.com",
  "efinancialcareers.com", "jobtome.com", "jobrapido.com", "bebee.com", "recruit.net",
  "learn4good.com", "hiring.cafe", "workinstartups.com", "jobbank.gc.ca", "jobs.ac.uk",
  "datacenterdynamics.com", "glassdoor.com", "indeed.com",
];

// The ones with a domain per country (indeed.co.uk, glassdoor.ie, seek.com.au…),
// plus the platforms whose host varies but whose brand does not.
export const NOT_EMPLOYER_PATTERNS = [
  /(^|\.)indeed\./, /(^|\.)glassdoor\./, /(^|\.)monster\./, /(^|\.)ziprecruiter\./,
  /(^|\.)adzuna\./, /(^|\.)jooble\./, /(^|\.)careerjet\./, /(^|\.)trovit\./,
  /(^|\.)stepstone\./, /(^|\.)seek\.com/, /(^|\.)talent\.com/, /(^|\.)neuvoo\./,
  /(^|\.)whatjobs\./, /(^|\.)jobstreet\./, /(^|\.)naukri\./, /(^|\.)oraclecloud\.com$/,
  /(^|\.)successfactors\./, /(^|\.)sapsf\./, /(^|\.)taleo\./, /(^|\.)icims\./,
  /(^|\.)greenhouse\./, /(^|\.)lever\.co$/, /(^|\.)myworkday/, /(^|\.)smartrecruiters\./,
  /(^|\.)teamtailor\./, /(^|\.)workable\./, /(^|\.)ashbyhq\./, /(^|\.)jobs\.google\./,
];
