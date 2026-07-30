// ============================================================
// Le Rasa — Privacy Policy content (/privacy-policy)
//
// The verbatim Termly export for LE RASA LIMITED, transcribed to Markdown.
// It lives in code rather than in the `policies` table on purpose: this is a
// legal document, so it is version-controlled and reviewed like code instead of
// being editable from the admin panel. The admin-managed policy system at
// /policies/[slug] is untouched.
//
// ─── RULES FOR EDITING ──────────────────────────────────────────────────────
// The wording here is the legal text and must match the Termly document
// exactly. When Termly is regenerated, re-transcribe rather than paraphrase.
// British spellings ('organisation', 'fulfil', 'authorised'), the ALL-CAPS
// headings, and the straight quotes around defined terms are all as Termly
// renders them — they are not typos.
//
// Three transformations were applied, and only these three:
//   1. Termly's internal anchors (#infocollect, #whoshare, #uslaws, …) were
//      remapped to this page's readable section ids. Every link target still
//      resolves to the same section.
//   2. Bare URLs were written as explicit Markdown links, because CommonMark
//      (no remark-gfm here) does not auto-link them and Termly renders them
//      as links.
//   3. Termly's two unfilled Cookie Notice blanks ('__________', in sections 5
//      and 11) were filled at the owner's instruction. The link TEXT is the
//      public URL but the href is the internal route /policies/cookie-policy,
//      so the jump stays in-tab and survives a domain change. Fill the field in
//      Termly too, so the next export doesn't reintroduce the blanks.
//
// `heading` values include Termly's own numbering, so the page renders them
// as-is and adds no numbering of its own. Keep `id`s stable — they are the
// public #anchors people bookmark, and the cross-reference links below.
// ============================================================

import { md, type LegalSection } from "@/lib/legal-policy";

/**
 * The company as named in the document. Termly writes it in caps
 * ('LE RASA LIMITED'); this title-case form is used only for this page's own
 * chrome (hero, meta description), never inside the legal text.
 */
export const PRIVACY_POLICY_ENTITY: string = "Le Rasa Limited";

/** The "Last updated" line from the top of the Termly document. */
export const PRIVACY_POLICY_LAST_UPDATED: string = "July 29, 2026";

/** The introduction that precedes "SUMMARY OF KEY POINTS". */
export const PRIVACY_POLICY_INTRO: string = `This Privacy Notice for LE RASA LIMITED ('**we**', '**us**', or '**our**'), describes how and why we might access, collect, store, use, and/or share ('**process**') your personal information when you use our services ('**Services**'), including when you:

- Visit our website at [https://www.lerasa.co.uk](https://www.lerasa.co.uk) or any website of ours that links to this Privacy Notice
- Use Le Rasa – Eggless Bakery. Le Rasa is a premium eggless bakery offering handcrafted cakes, pastries, desserts, cupcakes, brownies, and celebration treats. Customers can browse our online menu, place orders, make secure online payments, and choose delivery or collection. We focus on high-quality ingredients, fresh preparation, and exceptional customer service.
- Engage with us in other related ways, including any marketing or events

**Questions or concerns?** Reading this Privacy Notice will help you understand your privacy rights and choices. We are responsible for making decisions about how your personal information is processed. If you do not agree with our policies and practices, please do not use our Services. If you still have any questions or concerns, please contact us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com).`;

/** The notice, in Termly's order. */
export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    id: "summary",
    heading: "SUMMARY OF KEY POINTS",
    blocks: [
      md(`***This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by clicking the link following each key point or by using our [table of contents](#toc) below to find the section you are looking for.***

**What personal information do we process?** When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use. Learn more about [personal information you disclose to us](#information-we-collect).

**Do we process any sensitive personal information?** Some of the information may be considered 'special' or 'sensitive' in certain jurisdictions, for example your racial or ethnic origins, sexual orientation, and religious beliefs. We do not process sensitive personal information.

**Do we collect any information from third parties?** We do not collect any information from third parties.

**How do we process your information?** We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent. We process your information only when we have a valid legal reason to do so. Learn more about [how we process your information](#how-we-process).

**In what situations and with which parties do we share personal information?** We may share information in specific situations and with specific third parties. Learn more about [when and with whom we share your personal information](#sharing).

**How do we keep your information safe?** We have adequate organisational and technical processes and procedures in place to protect your personal information. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorised third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Learn more about [how we keep your information safe](#security).

**What are your rights?** Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information. Learn more about [your privacy rights](#your-rights).

**How do you exercise your rights?** The easiest way to exercise your rights is by visiting [https://www.lerasa.co.uk/contact](https://www.lerasa.co.uk/contact), or by contacting us. We will consider and act upon any request in accordance with applicable data protection laws.

Want to learn more about what we do with any information we collect? [Review the Privacy Notice in full](#toc).`),
    ],
  },

  {
    id: "information-we-collect",
    heading: "1. WHAT INFORMATION DO WE COLLECT?",
    blocks: [
      md(`### Personal information you disclose to us

**_In Short:_** _We collect personal information that you provide to us._

We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.

**Personal Information Provided by You.** The personal information that we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include the following:

- names
- phone numbers
- email addresses
- mailing addresses
- usernames
- passwords
- contact preferences
- billing addresses
- contact or authentication data

**Sensitive Information.** We do not process sensitive information.

**Payment Data.** We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by Stripe. You may find their privacy notice link(s) here: [https://stripe.com/privacy](https://stripe.com/privacy).

**Social Media Login Data.** We may provide you with the option to register with us using your existing social media account details, like your Facebook, X, or other social media account. If you choose to register in this way, we will collect certain profile information about you from the social media provider, as described in the section called '[HOW DO WE HANDLE YOUR SOCIAL LOGINS?](#social-logins)' below.

All personal information that you provide to us must be true, complete, and accurate, and you must notify us of any changes to such personal information.

### Google API

Our use of information received from Google APIs will adhere to [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the [Limited Use requirements](https://developers.google.com/terms/api-services-user-data-policy#limited-use).`),
    ],
  },

  {
    id: "how-we-process",
    heading: "2. HOW DO WE PROCESS YOUR INFORMATION?",
    blocks: [
      md(`**_In Short:_** _We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We process the personal information for the following purposes listed below. We may also process your information for other purposes only with your prior explicit consent._

**We process your personal information for a variety of reasons, depending on how you interact with our Services, including:**

- **To facilitate account creation and authentication and otherwise manage user accounts.** We may process your information so you can create and log in to your account, as well as keep your account in working order.
- **To deliver and facilitate delivery of services to the user.** We may process your information to provide you with the requested service.
- **To respond to user inquiries/offer support to users.** We may process your information to respond to your inquiries and solve any potential issues you might have with the requested service.
- **To send administrative information to you.** We may process your information to send you details about our products and services, changes to our terms and policies, and other similar information.
- **To fulfil and manage your orders.** We may process your information to fulfil and manage your orders, payments, returns, and exchanges made through the Services.
- **To request feedback.** We may process your information when necessary to request feedback and to contact you about your use of our Services.
- **To protect our Services.** We may process your information as part of our efforts to keep our Services safe and secure, including fraud monitoring and prevention.
- **To identify usage trends.** We may process information about how you use our Services to better understand how they are being used so we can improve them.
- **To save or protect an individual's vital interest.** We may process your information when necessary to save or protect an individual’s vital interest, such as to prevent harm.`),
    ],
  },

  {
    id: "legal-bases",
    heading: "3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?",
    blocks: [
      md(`_**In Short:** We only process your personal information when we believe it is necessary and we have a valid legal reason (i.e. legal basis) to do so under applicable law, like with your consent, to comply with laws, to provide you with services to enter into or fulfil our contractual obligations, to protect your rights, or to fulfil our legitimate business interests._

***If you are located in the EU or UK, this section applies to you.***

The General Data Protection Regulation (GDPR) and UK GDPR require us to explain the valid legal bases we rely on in order to process your personal information. As such, we may rely on the following legal bases to process your personal information:

- **Consent.** We may process your information if you have given us permission (i.e. consent) to use your personal information for a specific purpose. You can withdraw your consent at any time. Learn more about [withdrawing your consent](#your-rights).
- **Performance of a Contract.** We may process your personal information when we believe it is necessary to fulfil our contractual obligations to you, including providing our Services or at your request prior to entering into a contract with you.
- **Legitimate Interests.** We may process your information when we believe it is reasonably necessary to achieve our legitimate business interests and those interests do not outweigh your interests and fundamental rights and freedoms. For example, we may process your personal information for some of the purposes described in order to:
  - Analyse how our Services are used so we can improve them to engage and retain users
  - Diagnose problems and/or prevent fraudulent activities
  - Understand how our users use our products and services so we can improve user experience
- **Legal Obligations.** We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved.
- **Vital Interests.** We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.

***If you are located in Canada, this section applies to you.***

We may process your information if you have given us specific permission (i.e. express consent) to use your personal information for a specific purpose, or in situations where your permission can be inferred (i.e. implied consent). You can [withdraw your consent](#your-rights) at any time.

In some exceptional cases, we may be legally permitted under applicable law to process your information without your consent, including, for example:

- If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way
- For investigations and fraud detection and prevention
- For business transactions provided certain conditions are met
- If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim
- For identifying injured, ill, or deceased persons and communicating with next of kin
- If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse
- If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province
- If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records
- If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced
- If the collection is solely for journalistic, artistic, or literary purposes
- If the information is publicly available and is specified by the regulations
- We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments`),
    ],
  },

  {
    id: "sharing",
    heading: "4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?",
    blocks: [
      md(`**_In Short:_** _We may share information in specific situations described in this section and/or with the following third parties._

**Vendors, Consultants, and Other Third-Party Service Providers.** We may share your data with third-party vendors, service providers, contractors, or agents ('**third parties**') who perform services for us or on our behalf and require access to such information to do that work. We have contracts in place with our third parties, which are designed to help safeguard your personal information. This means that they cannot do anything with your personal information unless we have instructed them to do it. They will also not share your personal information with any organisation apart from us. They also commit to protect the data they hold on our behalf and to retain it for the period we instruct.

The third parties we may share personal information with are as follows:

- **Allow Users to Connect to Their Third-Party Accounts**
  - Google Sign-In
- **Invoice and Billing**
  - Stripe
- **User Account Registration and Authentication**
  - Google Sign-In
- **Database & Authentication**
  - Supabase
- **Website Hosting**
  - Vercel

We also may need to share your personal information in the following situations:

- **Business Transfers.** We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.`),
    ],
  },

  {
    id: "cookies",
    heading: "5. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?",
    blocks: [
      md(`**_In Short:_** _We may use cookies and other tracking technologies to collect and store your information._

We may use cookies and similar tracking technologies (like web beacons and pixels) to gather information when you interact with our Services. Some online tracking technologies help us maintain the security of our Services and your account, prevent crashes, fix bugs, save your preferences, and assist with basic site functions.

We also permit third parties and service providers to use online tracking technologies on our Services for analytics and advertising, including to help manage and display advertisements or to tailor advertisements to your interests. The third parties and service providers use their technology to provide advertising about products and services tailored to your interests which may appear either on our Services or on other websites.

To the extent these online tracking technologies are deemed to be a 'sale'/'sharing' (which includes targeted advertising, as defined under the applicable laws) under applicable US state laws, you can opt out of these online tracking technologies by submitting a request as described below under section '[DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?](#us-privacy-rights)'

Specific information about how we use such technologies and how you can refuse certain cookies is set out in our Cookie Notice: [https://www.lerasa.co.uk/policies/cookie-policy](/policies/cookie-policy).`),
    ],
  },

  {
    id: "social-logins",
    heading: "6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?",
    blocks: [
      md(`**_In Short:_** _If you choose to register or log in to our Services using a social media account, we may have access to certain information about you._

Our Services offer you the ability to register and log in using your third-party social media account details (like your Facebook or X logins). Where you choose to do this, we will receive certain profile information about you from your social media provider. The profile information we receive may vary depending on the social media provider concerned, but will often include your name, email address, friends list, and profile picture, as well as other information you choose to make public on such a social media platform.

We will use the information we receive only for the purposes that are described in this Privacy Notice or that are otherwise made clear to you on the relevant Services. Please note that we do not control, and are not responsible for, other uses of your personal information by your third-party social media provider. We recommend that you review their privacy notice to understand how they collect, use, and share your personal information, and how you can set your privacy preferences on their sites and apps.`),
    ],
  },

  {
    id: "intl-transfers",
    heading: "7. IS YOUR INFORMATION TRANSFERRED INTERNATIONALLY?",
    blocks: [
      md(`**_In Short:_** _We may transfer, store, and process your information in countries other than your own._

Our servers are located in the United Kingdom and United States. Regardless of your location, please be aware that your information may be transferred to, stored by, and processed by us in our facilities and in the facilities of the third parties with whom we may share your personal information (see '[WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?](#sharing)' above), including facilities in the United States, and other countries.

If you are a resident in the European Economic Area (EEA), United Kingdom (UK), or Switzerland, then these countries may not necessarily have data protection laws or other similar laws as comprehensive as those in your country. However, we will take all necessary measures to protect your personal information in accordance with this Privacy Notice and applicable law.

European Commission's Standard Contractual Clauses:

We have implemented measures to protect your personal information, including by using the European Commission's Standard Contractual Clauses for transfers of personal information between our group companies and between us and our third-party providers. These clauses require all recipients to protect all personal information that they process originating from the EEA or UK in accordance with European data protection laws and regulations. Our Standard Contractual Clauses can be provided upon request. We have implemented similar appropriate safeguards with our third-party service providers and partners and further details can be provided upon request.`),
    ],
  },

  {
    id: "retention",
    heading: "8. HOW LONG DO WE KEEP YOUR INFORMATION?",
    blocks: [
      md(`**_In Short:_** _We keep your information for as long as necessary to fulfil the purposes outlined in this Privacy Notice unless otherwise required by law._

We will only keep your personal information for as long as it is necessary for the purposes set out in this Privacy Notice, unless a longer retention period is required or permitted by law (such as tax, accounting, or other legal requirements). No purpose in this notice will require us keeping your personal information for longer than the period of time in which users have an account with us.

When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymise such information, or, if this is not possible (for example, because your personal information has been stored in backup archives), then we will securely store your personal information and isolate it from any further processing until deletion is possible.`),
    ],
  },

  {
    id: "security",
    heading: "9. HOW DO WE KEEP YOUR INFORMATION SAFE?",
    blocks: [
      md(`**_In Short:_** _We aim to protect your personal information through a system of organisational and technical security measures._

We have implemented appropriate and reasonable technical and organisational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorised third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information. Although we will do our best to protect your personal information, transmission of personal information to and from our Services is at your own risk. You should only access the Services within a secure environment.`),
    ],
  },

  {
    id: "minors",
    heading: "10. DO WE COLLECT INFORMATION FROM MINORS?",
    blocks: [
      md(`**_In Short:_** _We do not knowingly collect data from or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction._

We do not knowingly collect, solicit data from, or market to children under 18 years of age or the equivalent age as specified by law in your jurisdiction, nor do we knowingly sell such personal information. By using the Services, you represent that you are at least 18 or the equivalent age as specified by law in your jurisdiction or that you are the parent or guardian of such a minor and consent to such minor dependent’s use of the Services. If we learn that personal information from users less than 18 years of age or the equivalent age as specified by law in your jurisdiction has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under age 18 or the equivalent age as specified by law in your jurisdiction, please contact us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com).`),
    ],
  },

  {
    id: "your-rights",
    heading: "11. WHAT ARE YOUR PRIVACY RIGHTS?",
    blocks: [
      md(`**_In Short:_** _Depending on your state of residence in the US or in some regions, such as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and Canada, you have rights that allow you greater access to and control over your personal information. You may review, change, or terminate your account at any time, depending on your country, province, or state of residence._

In some regions (like the EEA, UK, Switzerland, and Canada), you have certain rights under applicable data protection laws. These may include the right (i) to request access and obtain a copy of your personal information, (ii) to request rectification or erasure; (iii) to restrict the processing of your personal information; (iv) if applicable, to data portability; and (v) not to be subject to automated decision-making. If a decision that produces legal or similarly significant effects is made solely by automated means, we will inform you, explain the main factors, and offer a simple way to request human review. In certain circumstances, you may also have the right to object to the processing of your personal information. You can make such a request by contacting us by using the contact details provided in the section '[HOW CAN YOU CONTACT US ABOUT THIS NOTICE?](#contact-us)' below.

We will consider and act upon any request in accordance with applicable data protection laws.

If you are located in the UK and are unhappy with how we have handled your personal information, you can make a complaint directly to us. This is in addition to the rights you have under the UK General Data Protection Regulation and the Data Protection Act 2018.

How to contact us:

- **Online:** [https://www.lerasa.co.uk/contact](https://www.lerasa.co.uk/contact)
- **Email:** [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com)
- **Post:** See '[HOW CAN YOU CONTACT US ABOUT THIS NOTICE?](#contact-us)'

What happens after you complain

- We will acknowledge your complaint within 30 days of receiving it.
- We will investigate without unjustifiable or excessive delay.
- We will keep you informed of progress and explain the outcome.

If you are not happy with our final response, you can refer your complaint to the Information Commissioner's Office, the UK supervisory authority.

- **Website:** [ico.org.uk/make-a-complaint](http://ico.org.uk/make-a-complaint)
- **Helpline:** 0303 123 1113
- **Post:** Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF

If you are located in the EEA or UK and you believe we are unlawfully processing your personal information, you also have the right to complain to your [Member State data protection authority](https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm) or [UK data protection authority](https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/).

If you are located in Switzerland, you may contact the [Federal Data Protection and Information Commissioner](https://www.edoeb.admin.ch/edoeb/en/home.html).

**Withdrawing your consent:** If we are relying on your consent to process your personal information, which may be express and/or implied consent depending on the applicable law, you have the right to withdraw your consent at any time. You can withdraw your consent at any time by contacting us by using the contact details provided in the section '[HOW CAN YOU CONTACT US ABOUT THIS NOTICE?](#contact-us)' below.

However, please note that this will not affect the lawfulness of the processing before its withdrawal nor, when applicable law allows, will it affect the processing of your personal information conducted in reliance on lawful processing grounds other than consent.

### Account Information

If you would at any time like to review or change the information in your account or terminate your account, you can:

- Log in to your account settings and update your user account.
- Contact us using the contact information provided.

Upon your request to terminate your account, we will deactivate or delete your account and information from our active databases. However, we may retain some information in our files to prevent fraud, troubleshoot problems, assist with any investigations, enforce our legal terms and/or comply with applicable legal requirements.

**Cookies and similar technologies:** Most Web browsers are set to accept cookies by default. If you prefer, you can usually choose to set your browser to remove cookies and to reject cookies. If you choose to remove cookies or reject cookies, this could affect certain features or services of our Services. For further information, please see our Cookie Notice: [https://www.lerasa.co.uk/policies/cookie-policy](/policies/cookie-policy).

If you have questions or comments about your privacy rights, you may email us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com).`),
    ],
  },

  {
    id: "do-not-track",
    heading: "12. CONTROLS FOR DO-NOT-TRACK FEATURES",
    blocks: [
      md(`Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track ('DNT') feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for recognising and implementing DNT signals has been finalised. As such, we do not currently respond to DNT browser signals or any other mechanism that automatically communicates your choice not to be tracked online. If a standard for online tracking is adopted that we must follow in the future, we will inform you about that practice in a revised version of this Privacy Notice.

California law requires us to let you know how we respond to web browser DNT signals. Because there currently is not an industry or legal standard for recognising or honouring DNT signals, we do not respond to them at this time.`),
    ],
  },

  {
    id: "us-privacy-rights",
    heading: "13. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?",
    blocks: [
      md(`**_In Short:_** _If you are a resident of California, Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may have the right to request access to and receive details about the personal information we maintain about you and how we have processed it, correct inaccuracies, get a copy of, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. More information is provided below._

### Categories of Personal Information We Collect

The table below shows the categories of personal information we have collected in the past twelve (12) months. The table includes illustrative examples of each category and does not reflect the personal information we collect from you. For a comprehensive inventory of all personal information we process, please refer to the section '[WHAT INFORMATION DO WE COLLECT?](#information-we-collect)'`),
      {
        kind: "table",
        headers: ["Category", "Examples", "Collected"],
        rows: [
          [
            "A. Identifiers",
            "Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name",
            "YES",
          ],
          [
            "B. Personal information as defined in the California Customer Records statute",
            "Name, contact information, education, employment, employment history, and financial information",
            "YES",
          ],
          [
            "C. Protected classification characteristics under state or federal law",
            "Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data",
            "NO",
          ],
          [
            "D. Commercial information",
            "Transaction information, purchase history, financial details, and payment information",
            "YES",
          ],
          ["E. Biometric information", "Fingerprints and voiceprints", "NO"],
          [
            "F. Internet or other similar network activity",
            "Browsing history, search history, online behaviour, interest data, and interactions with our and other websites, applications, systems, and advertisements",
            "NO",
          ],
          ["G. Geolocation data", "Device location", "NO"],
          [
            "H. Audio, electronic, sensory, or similar information",
            "Images and audio, video or call recordings created in connection with our business activities",
            "NO",
          ],
          [
            "I. Professional or employment-related information",
            "Business contact details in order to provide you our Services at a business level or job title, work history, and professional qualifications if you apply for a job with us",
            "NO",
          ],
          ["J. Education Information", "Student records and directory information", "NO"],
          [
            "K. Inferences drawn from collected personal information",
            "Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual’s preferences and characteristics",
            "NO",
          ],
          ["L. Sensitive personal Information", "", "NO"],
        ],
      },
      md(`We may also collect other personal information outside of these categories through instances where you interact with us in person, online, or by phone or mail in the context of:

- Receiving help through our customer support channels;
- Participation in customer surveys or contests; and
- Facilitation in the delivery of our Services and to respond to your inquiries.

We will use and retain the collected personal information as needed to provide the Services or for:

- Category A - As long as the user has an account with us
- Category B - As long as the user has an account with us
- Category D - As long as the user has an account with us

### Sources of Personal Information

Learn more about the sources of personal information we collect in '[WHAT INFORMATION DO WE COLLECT?](#information-we-collect)'

### How We Use and Share Personal Information

Learn more about how we use your personal information in the section, '[HOW DO WE PROCESS YOUR INFORMATION?](#how-we-process)'

**Will your information be shared with anyone else?**

We may disclose your personal information with our service providers pursuant to a written contract between us and each service provider. Learn more about how we disclose personal information to in the section, '[WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?](#sharing)'

We may use your personal information for our own business purposes, such as for undertaking internal research for technological development and demonstration. This is not considered to be 'selling' of your personal information.

We have not sold or shared any personal information to third parties for a business or commercial purpose in the preceding twelve (12) months. We have disclosed the following categories of personal information to third parties for a business or commercial purpose in the preceding twelve (12) months:

- Category A. Identifiers
- Category B. Personal information as defined in the California Customer Records law
- Category D. Commercial information

The categories of third parties to whom we disclosed personal information for a business or commercial purpose can be found under '[WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?](#sharing)'

### Your Rights

You have rights under certain US state data protection laws. However, these rights are not absolute, and in certain cases, we may decline your request as permitted by law. These rights include:

- **Right to know** whether or not we are processing your personal data
- **Right to access** your personal data
- **Right to correct** inaccuracies in your personal data
- **Right to request** the deletion of your personal data
- **Right to obtain a copy** of the personal data you previously shared with us
- **Right to non-discrimination** for exercising your rights
- **Right to opt out** of the processing of your personal data if it is used for targeted advertising (or sharing as defined under California’s privacy law), the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects ('profiling')

Depending upon the state where you live, you may also have the following rights:

- Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota)
- Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California, Delaware, and Maryland)
- Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in Minnesota and Oregon)
- Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut)
- Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in Connecticut and Minnesota)
- Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)
- Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial recognition feature (as permitted by applicable law, including the privacy law in Florida)

### How to Exercise Your Rights

To exercise these rights, you can contact us by visiting [https://www.lerasa.co.uk/contact](https://www.lerasa.co.uk/contact), by emailing us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com), by visiting [http://www.lerasa.co.uk/contact](http://www.lerasa.co.uk/contact), or by referring to the contact details at the bottom of this document.

Under certain US state data protection laws, you can designate an authorised agent to make a request on your behalf. We may deny a request from an authorised agent that does not submit proof that they have been validly authorised to act on your behalf in accordance with applicable laws.

### Request Verification

Upon receiving your request, we will need to verify your identity to determine you are the same person about whom we have the information in our system. We will only use personal information provided in your request to verify your identity or authority to make the request. However, if we cannot verify your identity from the information already maintained by us, we may request that you provide additional information for the purposes of verifying your identity and for security or fraud-prevention purposes.

If you submit the request through an authorised agent, we may need to collect additional information to verify your identity before processing your request and the agent will need to provide a written and signed permission from you to submit such request on your behalf.

### Appeals

Under certain US state data protection laws, if we decline to take action regarding your request, you may appeal our decision by emailing us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com). We will inform you in writing of any action taken or not taken in response to the appeal, including a written explanation of the reasons for the decisions. If your appeal is denied, you may submit a complaint to your state attorney general.

### California 'Shine The Light' Law

California Civil Code Section 1798.83, also known as the 'Shine The Light' law, permits our users who are California residents to request and obtain from us, once a year and free of charge, information about categories of personal information (if any) we disclosed to third parties for direct marketing purposes and the names and addresses of all third parties with which we shared personal information in the immediately preceding calendar year. If you are a California resident and would like to make such a request, please submit your request in writing to us by using the contact details provided in the section '[HOW CAN YOU CONTACT US ABOUT THIS NOTICE?](#contact-us)'`),
    ],
  },

  {
    id: "updates",
    heading: "14. DO WE MAKE UPDATES TO THIS NOTICE?",
    blocks: [
      md(`_**In Short:** Yes, we will update this notice as necessary to stay compliant with relevant laws._

We may update this Privacy Notice from time to time. The updated version will be indicated by an updated 'Revised' date at the top of this Privacy Notice. If we make material changes to this Privacy Notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification. We encourage you to review this Privacy Notice frequently to be informed of how we are protecting your information.`),
    ],
  },

  {
    id: "contact-us",
    heading: "15. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?",
    blocks: [
      md(`If you have questions or comments about this notice, you may email us at [Info.lerasa@gmail.com](mailto:Info.lerasa@gmail.com) or contact us by post at:

LE RASA LIMITED\\
Flat 7 Harrison court , Harrison court\\
harrow\\
HA2 0WR\\
United Kingdom`),
    ],
  },

  {
    id: "review-update-delete",
    heading: "16. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?",
    blocks: [
      md(`Based on the applicable laws of your country or state of residence in the US, you may have the right to request access to the personal information we collect from you, details about how we have processed it, correct inaccuracies, or delete your personal information. You may also have the right to withdraw your consent to our processing of your personal information. These rights may be limited in some circumstances by applicable law. To request to review, update, or delete your personal information, please visit: [https://www.lerasa.co.uk/contact](https://www.lerasa.co.uk/contact).`),
    ],
  },
];
