// --- CONFIGURATION ---
const WEBHOOK_URL = 'https://surgery-donors-weblogs-banana.trycloudflare.com/webhook/';

/**
 * Sends collected user selections and contact inputs to n8n Webhook.
 * Normalized schema compliant with Astralwebs Demo Form specification.
 * Resilient multi-mode transmission:
 *   - Automatic candidate endpoint resolution (handles base URL as well as specific node ID)
 *   - Automatic Production URL (/webhook/) vs Test URL (/webhook-test/) fallback
 *   - Automatic POST (JSON) vs GET (query params) vs POST (plain text) fallback (supports n8n nodes set to GET or POST)
 */
async function submitFormToWebhook(formDataObject) {
  const NODE_UUID = '60d26402-219e-4140-9af9-4bb99ae0008d';

  const payload = {
    submittedAt: new Date().toISOString(),
    source: 'Astralwebs Demo Form',
    industry: formDataObject.industry || 'NOT PROVIDED',
    companySize: formDataObject.companySize || 'NOT PROVIDED',
    annualRevenue: formDataObject.annualRevenue || 'NOT PROVIDED',
    bottlenecks: Array.isArray(formDataObject.bottlenecks) ? formDataObject.bottlenecks : [formDataObject.bottlenecks].filter(Boolean),
    fullName: formDataObject.fullName || '',
    email: formDataObject.email || '',
    phone: formDataObject.phone || '',
    companyName: formDataObject.companyName || ''
  };

  if (formDataObject.website) payload.website = formDataObject.website;
  if (formDataObject.additionalNotes) payload.additionalNotes = formDataObject.additionalNotes;

  const primaryUrl = WEBHOOK_URL.trim();
  const secondaryUrl = primaryUrl.includes('/webhook-test/')
    ? primaryUrl.replace('/webhook-test/', '/webhook/')
    : primaryUrl.replace('/webhook/', '/webhook-test/');

  // Assemble prioritized candidate URLs
  const candidateUrls = [];

  const addCandidates = (baseUrl) => {
    if (baseUrl.endsWith('/webhook/') || baseUrl.endsWith('/webhook-test/')) {
      candidateUrls.push(baseUrl + NODE_UUID);
      candidateUrls.push(baseUrl.replace(/\/$/, ''));
      candidateUrls.push(baseUrl);
    } else {
      candidateUrls.push(baseUrl);
    }
  };

  addCandidates(primaryUrl);
  if (secondaryUrl !== primaryUrl) {
    addCandidates(secondaryUrl);
  }

  // Also include local equivalent for resilience if tunnel is used
  if (primaryUrl.includes('trycloudflare.com')) {
    const localEquiv = primaryUrl.replace(/https:\/\/[^/]+/, 'http://localhost:5678');
    addCandidates(localEquiv);
  }

  // De-duplicate URLs while preserving priority order
  const uniqueUrls = [...new Set(candidateUrls)];

  // Prepare GET query parameters in case the n8n Webhook node method is GET
  const qParams = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) {
      qParams.append(k, Array.isArray(v) ? v.join(', ') : String(v));
    }
  }
  const qs = qParams.toString();

  let lastStatus = 0;
  let lastDetail = '';

  for (const url of uniqueUrls) {
    // 1. Try POST (JSON)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json().catch(() => ({ status: 'received' }));
        return { success: true, data: result };
      }

      lastStatus = res.status;
      const resText = await res.text().catch(() => '');
      if (resText) {
        try {
          const parsed = JSON.parse(resText);
          if (parsed && parsed.message) lastDetail = parsed.message;
        } catch (_) {
          lastDetail = resText.slice(0, 100);
        }
      }
    } catch (err) {
      // POST network or CORS preflight error
    }

    // 2. Try GET with query parameters (in case node is set to GET or POST failed CORS)
    try {
      const getUrl = url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
      const resGet = await fetch(getUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (resGet.ok) {
        const result = await resGet.json().catch(() => ({ status: 'received' }));
        return { success: true, data: result };
      }

      if (!lastStatus) lastStatus = resGet.status;
    } catch (err) {
      // GET network or CORS error
    }

    // 3. Try POST (text/plain) fallback (bypasses CORS preflight for POST nodes)
    try {
      const resPlain = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      if (resPlain.ok) {
        const result = await resPlain.json().catch(() => ({ status: 'received' }));
        return { success: true, data: result };
      }
    } catch (_) {}
  }

  const detailSuffix = lastDetail ? ` (${lastDetail})` : '';
  const errMessage = lastStatus === 404
    ? `HTTP 404: Not Found${detailSuffix}`
    : (lastStatus ? `HTTP ${lastStatus}${detailSuffix}` : 'Failed to connect to n8n webhook');
  throw new Error(`Webhook responded with ${errMessage}`);
}
window.submitFormToWebhook = submitFormToWebhook;

/**
 * Astralwebs Cardless UI Scaffold (Validation & Background Color Fixes)
 * Full Multi-Step Form: Steps 1 through 5 (Contact Details & Custom Textarea)
 * Features:
 *   - Explicit bgColor on all data objects with fallback to #202124
 *   - Explicit DOM update: document.getElementById('bg-glow').style.setProperty('--active-glow-color', ...)
 *   - Progression Validation (Steps 1-4): Requires explicit selection before advancing on Enter
 *   - Shake animation on .active-stage if advancing without selection
 *   - Step 5 Strict Input Validation with #input-error-message, red border, and GSAP input shake
 *   - Step 5 Input Value Clearing & Explicit State Restoration
 *   - Option 6 Ghost Asset Removal & Centered Textarea
 *   - Strict GSAP Flip Spatial Flight across 3 Grid Coordinates
 */

// Register Flip Plugin with GSAP
if (typeof gsap !== 'undefined' && typeof Flip !== 'undefined') {
  gsap.registerPlugin(Flip);
}

// --- PERFORMANCE OPTIMIZATIONS ---
if (typeof gsap !== 'undefined') {
  gsap.ticker.lagSmoothing(1000, 16); 
  // Forces GSAP to adjust its internal clock if a frame takes longer than 16ms, preventing sudden jumps on 120Hz monitors.
}

// ==========================================================================
// ZERO-LATENCY AUDIO FILE INTEGRATION (PSP STYLE)
// ==========================================================================
// 1. Initialize audio instances (keep volume subtle)
const hoverSound = new Audio('./assets/tick.mp3');
hoverSound.volume = 0.4;
hoverSound.preload = 'auto';

const confirmSound = new Audio('./assets/confirm.mp3');
confirmSound.volume = 0.4;
confirmSound.preload = 'auto';

const cancelSound = new Audio('./assets/cancel.mp3');
cancelSound.volume = 0.4;
cancelSound.preload = 'auto';

// Unlock audio on first interaction to comply with browser autoplay policies
const unlockAudio = () => {
  hoverSound.load();
  confirmSound.load();
  cancelSound.load();
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
};
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// 2. Playback logic with instant reset
function playTick() {
  hoverSound.currentTime = 0; // INSTANT RESET: Cuts off previous sound to prevent echo
  hoverSound.play().catch(() => {
  });
}

// Zero-Latency Carousel / Step Navigation Audio
function playNavSound() {
  playTick();
}
window.playNavSound = playNavSound;

function playConfirm() {
  confirmSound.currentTime = 0;
  confirmSound.play().catch(() => {});
}

function playCancel() {
  cancelSound.currentTime = 0;
  cancelSound.play().catch(() => {});
}


// 1. STATE VARIABLES
let activeStep = 1;
let activeOption = 0;
let isAnimating = false;
let appStarted = false;
let currentGlowColor = '#E37400';

// Progression selections tracking for Steps 1-4
const stepSelections = {
  1: null,
  2: null,
  3: null,
  4: null
};

// Form Data Store across all steps
const formData = {};
Object.defineProperty(formData, 'contact', {
  value: {},
  writable: true,
  enumerable: false, // Hidden from Object.entries loop so only actual selections & inputs are iterated
  configurable: true
});

// Dynamic 3D Image properties hidden from Object.entries iteration to keep payload & receipt pure
['industryImage', 'sizeImage', 'companySizeImage', 'revenueImage', 'bottleneckImage'].forEach((prop) => {
  let val = '';
  Object.defineProperty(formData, prop, {
    get: () => val,
    set: (newVal) => { val = newVal; },
    enumerable: false,
    configurable: true
  });
});

// Reduced motion detection
function isReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 2. DATA: FULL MULTI-STEP PIPELINE WITH BRAND-ALIGNED FULL-BLEED COLORS

// STEP 1: INDUSTRY (EXACT VIDEO COLOR MAPPING)
const industryDataArray = [
  {
    title: 'Roofing & Solar',
    subtitle: 'High-ticket residential solar & structural roofing infrastructure pipeline.',
    image: './assets/step1-1.webp',
    bgColor: '#E37400', // Option 1 (Puffer Jacket / Roofing): Vibrant Orange
    color: '#E37400',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Home Remodeling & Design-Build',
    subtitle: 'Architectural renovations, estate transformations & high-value contracting.',
    image: './assets/step1-2.webp',
    bgColor: '#202124', // Option 2 (Dark Jacket / Remodel): Deep Grey
    color: '#202124',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Commercial HVAC & Mechanical',
    subtitle: 'Enterprise thermal building systems, automated dispatch & recurring contracts.',
    image: './assets/step1-3.webp',
    bgColor: '#A50E0E', // Option 3 (Red Jacket / HVAC): Crimson Red
    color: '#A50E0E',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Medical Spas & Aesthetics',
    subtitle: 'Bespoke clinical treatments, patient acquisition & high-retention memberships.',
    image: './assets/step1-4.webp',
    bgColor: '#9AA0A6', // Option 4 (White Jacket / Medspa): Metallic Light Grey
    color: '#9AA0A6',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Pool Construction & Outdoor Living',
    subtitle: 'Custom luxury aquatic installations, stone masonry & outdoor architecture.',
    image: './assets/step1-5.webp',
    bgColor: '#174EA6',
    color: '#174EA6',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Dental Specialty & Cosmetic',
    subtitle: 'Smile transformations, veneers, full-mouth restoration & high-trust funnels.',
    image: './assets/step1-6.webp',
    bgColor: '#4285F4',
    color: '#4285F4',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  },
  {
    title: 'Home Automation & Custom AV',
    subtitle: 'Integrated home intelligence, high-fidelity theater & acoustic systems.',
    image: './assets/step1-7.webp',
    bgColor: '#FFBC04',
    color: '#FFBC04',
    stepNum: 'STEP 01',
    stepName: 'SELECT INDUSTRY'
  }
];

// STEP 2: COMPANY SIZE
const companySizeDataArray = [
  {
    title: '1-5 EMPLOYEES',
    subtitle: 'Agile core team maximizing lean velocity and direct founder execution.',
    image: './assets/step2-1.webp',
    bgColor: '#174EA6',
    color: '#174EA6',
    stepNum: 'STEP 02',
    stepName: 'COMPANY SIZE'
  },
  {
    title: '6-20 EMPLOYEES',
    subtitle: 'Expanding operational unit establishing departmental leadership & systems.',
    image: './assets/step2-2.webp',
    bgColor: '#4285F4',
    color: '#4285F4',
    stepNum: 'STEP 02',
    stepName: 'COMPANY SIZE'
  },
  {
    title: '21-100 EMPLOYEES',
    subtitle: 'Scaled enterprise engine requiring cross-functional automated sync.',
    image: './assets/step2-3.webp',
    bgColor: '#E37400',
    color: '#E37400',
    stepNum: 'STEP 02',
    stepName: 'COMPANY SIZE'
  },
  {
    title: '100+ EMPLOYEES',
    subtitle: 'Institutional market authority deploying multi-regional capital.',
    image: './assets/step2-4.webp',
    bgColor: '#0D652D',
    color: '#0D652D',
    stepNum: 'STEP 02',
    stepName: 'COMPANY SIZE'
  }
];

// STEP 3: REVENUE
const revenueDataArray = [
  {
    title: 'Under $50k/mo',
    subtitle: 'Emerging business building product-market fit and reliable client acquisition.',
    image: './assets/step3-1.webp',
    bgColor: '#0D652D',
    color: '#0D652D',
    stepNum: 'STEP 03',
    stepName: 'ANNUAL REVENUE'
  },
  {
    title: '$50k-$100k/mo',
    subtitle: 'Proven revenue model standardizing operations for sustained scale.',
    image: './assets/step3-2.webp',
    bgColor: '#FFBC04',
    color: '#FFBC04',
    stepNum: 'STEP 03',
    stepName: 'ANNUAL REVENUE'
  },
  {
    title: '$100k-$250k/mo',
    subtitle: 'High-growth market contender optimizing unit economics and client LTV.',
    image: './assets/step3-3.webp',
    bgColor: '#174EA6',
    color: '#174EA6',
    stepNum: 'STEP 03',
    stepName: 'ANNUAL REVENUE'
  },
  {
    title: '$250k+/mo',
    subtitle: 'Dominant category champion scaling multi-channel digital infrastructure.',
    image: './assets/step3-4.webp',
    bgColor: '#34A853',
    color: '#34A853',
    stepNum: 'STEP 03',
    stepName: 'ANNUAL REVENUE'
  }
];

// STEP 4: BOTTLENECKS
const bottlenecksDataArray = [
  {
    title: 'No automated follow-ups',
    subtitle: 'Inbound prospect leakage due to fragmented communication and response latency.',
    image: './assets/step4-1.webp',
    bgColor: '#A50E0E',
    color: '#A50E0E',
    stepNum: 'STEP 04',
    stepName: 'BOTTLENECKS'
  },
  {
    title: 'Manual data entry',
    subtitle: 'Inefficient manual CRM logging, delayed proposals, and pipeline opacity.',
    image: './assets/step4-2.webp',
    bgColor: '#EA4335',
    color: '#EA4335',
    stepNum: 'STEP 04',
    stepName: 'BOTTLENECKS'
  },
  {
    title: "Traffic isn't converting",
    subtitle: 'Paid campaign spend generating clicks but failing to book qualified appointments.',
    image: './assets/step4-3.webp',
    bgColor: '#E37400',
    color: '#E37400',
    stepNum: 'STEP 04',
    stepName: 'BOTTLENECKS'
  },
  {
    title: 'Bugs/slow speeds',
    subtitle: 'Technical friction and page latency shedding affluent prospects before checkout.',
    image: './assets/step4-4.webp',
    bgColor: '#A50E0E',
    color: '#A50E0E',
    stepNum: 'STEP 04',
    stepName: 'BOTTLENECKS'
  },
  {
    title: 'Outdated site',
    subtitle: 'Legacy visual aesthetic undercutting corporate credibility and high-ticket trust.',
    image: './assets/step4-5.webp',
    bgColor: '#202124',
    color: '#202124',
    stepNum: 'STEP 04',
    stepName: 'BOTTLENECKS'
  }
];

// STEP 5: CONTACT DETAILS (OPTION 6 CUSTOM TEXTAREA HAS NO ASSET -> TAKES STAGE ALONE)
const contactDataArray = [
  {
    title: "What's your name?",
    field: 'name',
    id: 'user-name',
    groupId: 'group-name',
    name: 'name',
    autocomplete: 'name',
    inputType: 'text',
    placeholder: 'YOUR NAME?',
    image: './assets/step5-1.webp',
    bgColor: '#174EA6',
    color: '#174EA6',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Company Name',
    field: 'company',
    id: 'user-organization',
    groupId: 'group-company',
    name: 'organization',
    autocomplete: 'organization',
    inputType: 'text',
    placeholder: 'YOUR COMPANY?',
    image: './assets/step5-2.webp',
    bgColor: '#202124',
    color: '#202124',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Best Email',
    field: 'email',
    id: 'user-email',
    groupId: 'group-email',
    name: 'email',
    autocomplete: 'email',
    inputType: 'email',
    placeholder: 'YOUR EMAIL?',
    image: './assets/step5-3.webp',
    bgColor: '#4285F4',
    color: '#4285F4',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Phone Number',
    field: 'phone',
    id: 'user-phone',
    groupId: 'group-phone',
    name: 'tel',
    autocomplete: 'tel',
    inputType: 'tel',
    placeholder: 'YOUR PHONE?',
    image: './assets/step5-4.webp',
    bgColor: '#174EA6',
    color: '#174EA6',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Website URL',
    field: 'website',
    id: 'user-website',
    groupId: 'group-website',
    name: 'url',
    autocomplete: 'url',
    inputType: 'url',
    placeholder: 'YOUR WEBSITE?',
    image: './assets/step5-5.webp',
    bgColor: '#0D652D',
    color: '#0D652D',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Anything else we should know?',
    field: 'additionalNotes',
    id: 'user-notes',
    groupId: 'group-notes',
    name: 'additionalNotes',
    autocomplete: 'off',
    inputType: 'textarea',
    placeholder: 'Tell us about specific goals, timelines, or requirements...',
    image: './assets/step5-6.webp',
    imagePath: './assets/step5-6.webp',
    bgColor: '#9AA0A6',
    color: '#9AA0A6',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  },
  {
    title: 'Ready to scale?',
    field: 'submit',
    id: 'launch-analysis-btn',
    groupId: 'group-submit',
    inputType: 'button',
    buttonText: 'LAUNCH ANALYSIS',
    image: './assets/step5-7.webp',
    bgColor: '#E37400',
    color: '#E37400',
    stepNum: 'STEP 05',
    stepName: 'CONTACT DETAILS'
  }
];

// Step Metadata: Explanatory paragraph directly below the step title explaining what the step is and how the selection helps
const stepMetadata = [
  {
    title: 'SELECT INDUSTRY',
    description: 'Choose your primary industry so we can match you with the exact conversion pipelines and case studies proven in your specific market.'
  },
  {
    title: 'COMPANY SIZE',
    description: 'Select your team size so we can tailor operational workflows, delegation frameworks, and scalable infrastructure to your capacity.'
  },
  {
    title: 'ANNUAL REVENUE',
    description: 'Indicate your current revenue tier so we can benchmark your growth targets against top-performing market leaders.'
  },
  {
    title: 'BOTTLENECKS',
    description: 'Identify your primary operational barrier so we can architect targeted automations to eliminate friction and prospect leakage.'
  },
  {
    title: 'CONTACT DETAILS',
    description: 'Drop your details below so our team can prepare a custom scale-plan before we even get on the call.'
  }
];

// Form steps registry
const formSteps = {
  1: industryDataArray,
  2: companySizeDataArray,
  3: revenueDataArray,
  4: bottlenecksDataArray,
  5: contactDataArray
};

// Guarantee both image and imagePath properties exist on all step items, and bind stepMetadata descriptions
Object.entries(formSteps).forEach(([stepKey, stepArray]) => {
  const stepIdx = parseInt(stepKey, 10) - 1;
  const meta = stepMetadata[stepIdx];
  if (Array.isArray(stepArray)) {
    stepArray.forEach((item) => {
      if (item.image && !item.imagePath) item.imagePath = item.image;
      if (item.imagePath && !item.image) item.image = item.imagePath;
      if (meta && !item.description) item.description = meta.description;
      if (meta && !item.stepDescription) item.stepDescription = meta.description;
    });
  }
});

// --------------------------------------------------------------------------
// 1. ASSET PRELOADING (ANTI-FLICKER & 60FPS)
// Loop through formSteps data arrays and preload every image path into memory
// --------------------------------------------------------------------------
const preloadedImages = [];

function preload(src) {
  if (!src) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  preloadedImages.push(img);
}

function preloadAllStepAssets() {
  Object.values(formSteps).forEach((stepArray) => {
    if (Array.isArray(stepArray)) {
      stepArray.forEach((item) => {
        if (item.image) preload(item.image);
        if (item.imagePath) preload(item.imagePath);
      });
    }
  });
}

// Fire preloading immediately so assets are decoded before first user interaction
preloadAllStepAssets();

const totalSteps = Object.keys(formSteps).length;

// Helper: Convert Hex color to RGB components for full-bleed rgba CSS gradient stops
function hexToRgb(hex) {
  if (!hex) return '242, 99, 0';
  if (hex.startsWith('rgb')) {
    const match = hex.match(/\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(',').slice(0, 3).map(p => p.trim());
      return parts.join(', ');
    }
  }
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return '242, 99, 0';
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r}, ${g}, ${b}`;
}

// Helper: Auto-format phone input into (XXX) XXX-XXXX as user types
function formatPhoneNumber(val) {
  if (!val) return '';
  let digits = val.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// 3. DYNAMIC FLAT BACKGROUND MANAGER (#bg-glow)
// Flat, full-screen color transition with no vignette or dark borders
function updateActiveGlowColor(newColor, tl = null, position = 0) {
  const safeColor = newColor || '#E37400';

  const applyGlow = (col) => {
    currentGlowColor = col;
    const bgGlow = document.getElementById('bg-glow');
    if (bgGlow) {
      bgGlow.style.setProperty('--active-glow-color', col);
      bgGlow.style.backgroundColor = col;
    }
    if (document.documentElement) {
      document.documentElement.style.setProperty('--active-glow-color', col);
    }
  };

  if (isReducedMotion()) {
    applyGlow(safeColor);
    return;
  }

  if (tl) {
    const proxy = { color: currentGlowColor };
    tl.to(proxy, {
      color: safeColor,
      duration: 0.35,
      ease: 'power2.out',
      overwrite: "auto",
      onUpdate: () => {
        applyGlow(proxy.color);
      }
    }, position);
  } else if (typeof gsap !== 'undefined') {
    const proxy = { color: currentGlowColor };
    gsap.to(proxy, {
      color: safeColor,
      duration: 0.35,
      ease: 'power2.out',
      overwrite: "auto",
      onUpdate: () => {
        applyGlow(proxy.color);
      }
    });
  } else {
    applyGlow(safeColor);
  }
}

// 4. TOP NAV ACTIVE PILL
function updateNavPill(step) {
  const navItems = document.querySelectorAll('.nav-pill-item');
  navItems.forEach((btn) => {
    const btnStep = parseInt(btn.dataset.step, 10);
    if (btnStep === step) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 5. PROGRESSION SELECTION (STEPS 1-4)
function selectOption(step, optionIndex) {
  stepSelections[step] = optionIndex;
  formData[step] = {
    ...formSteps[step][optionIndex],
    optionIndex: optionIndex
  };

  // Capture the src attribute of the <img> inside the selected option card in the DOM
  if (step >= 1 && step <= 4) {
    const selectedImg = document.querySelector('.active-stage .img-slot img') || 
                        document.getElementById('center-img') || 
                        document.querySelector(`.stage-img[data-flip-id="img-${step}-${optionIndex}"]`);
    const capturedSrc = (selectedImg && selectedImg.src) 
      ? selectedImg.src 
      : (formSteps[step] && formSteps[step][optionIndex] ? (formSteps[step][optionIndex].imagePath || formSteps[step][optionIndex].image || '') : '');

    formData[step].capturedImageSrc = capturedSrc;
    if (step === 1) formData.industryImage = capturedSrc;
    if (step === 2) {
      formData.sizeImage = capturedSrc;
      formData.companySizeImage = capturedSrc;
    }
    if (step === 3) formData.revenueImage = capturedSrc;
    if (step === 4) formData.bottleneckImage = capturedSrc;
  }

  updateSelectOptionButtonState();
}

// 5b. DYNAMIC RIGHT-COLUMN SELECTIONS RECEIPT (GRAPHIC OPTIONS & CONTACT INPUTS)
function updateReceipt() {
  const list = document.getElementById('receipt-list');
  if (!list) return;
  list.innerHTML = ''; 
  
  let index = 1;
  for (const [stepKey, selectedData] of Object.entries(formData)) {
    if (stepKey === 'contact' || stepKey.endsWith('Image') || !selectedData) continue;

    const li = document.createElement('li');
    li.style.opacity = '0';
    
    let title = '';
    let imgHTML = '';
    
    // Check if data is an object (Graphic Options) or a string (Contact Inputs)
    if (typeof selectedData === 'object' && selectedData !== null) {
      title = selectedData.title || '';
      const imgPath = selectedData.imagePath || selectedData.image || '';
      if (imgPath) {
        imgHTML = `<img src="${imgPath}" class="receipt-thumb" alt="thumb" />`;
      }
    } else {
      // Handle raw text input from the contact fields
      title = selectedData;
    }

    if (!title) continue;

    const indexStr = index < 10 ? `0${index}.` : `${index}.`;
    li.innerHTML = `${imgHTML}<span>${indexStr}</span> ${title}`;
    list.appendChild(li);
    index++;
  }

  const newListItem = list.lastElementChild;
  if (newListItem && typeof gsap !== 'undefined') {
    gsap.fromTo(newListItem, 
      { opacity: 0, x: 20 }, 
      { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }
    );
  }
  
  const previousItems = Array.from(list.children).slice(0, -1);
  if (previousItems.length > 0 && typeof gsap !== 'undefined') {
    gsap.set(previousItems, { opacity: 1, x: 0 });
  }
}

// Save activeOption data to formData (Enter Key & Selection Binding)
function saveSelection() {
  if (activeStep < 5) {
    selectOption(activeStep, activeOption);
    return true;
  } else if (activeStep === 5) {
    return validateStep5CurrentOption();
  }
  return true;
}

// Trigger GSAP transition to the next step
function advanceToNextStep() {
  if (activeStep < 5) {
    submitStep();
  } else if (activeStep === 5) {
    const valid = validateStep5CurrentOption(true);
    if (!valid) return;
    const currentStepArray = formSteps[5];
    if (activeOption >= currentStepArray.length - 2) {
      triggerFinalReview();
    } else {
      triggerNextOption();
    }
  }
}

function updateSelectOptionButtonState() {
  const selectBtn = document.getElementById('select-option-btn');
  if (!selectBtn || activeStep >= 5) return;

  const isSelected = (stepSelections[activeStep] === activeOption);
  if (isSelected) {
    selectBtn.classList.add('selected');
    selectBtn.textContent = '✓ SELECTED (PRESS ENTER TO ADVANCE)';
  } else {
    selectBtn.classList.remove('selected');
    selectBtn.textContent = 'SELECT OPTION';
  }
}

// 6. RENDER CENTER SUBTITLE OR INTERACTIVE INPUT / TEXTAREA
function renderCenterSubtitleOrInput(item) {
  const container = document.getElementById('center-text-group');
  if (!container) return;

  // Remove legacy main-title since .card-label inside .option-card holds the title
  const oldTitle = document.getElementById('main-title');
  if (oldTitle) oldTitle.remove();

  const form = document.getElementById('contact-autofill-form');

  if (activeStep === 5) {
    // Hide standard subtitle and selection button
    const oldSub = document.getElementById('main-subtitle');
    if (oldSub) oldSub.style.display = 'none';
    const oldSelectBtn = document.getElementById('select-option-btn');
    if (oldSelectBtn) oldSelectBtn.remove();

    if (form) {
      form.style.display = 'flex';
      const allGroups = form.querySelectorAll('.input-group');
      allGroups.forEach(grp => {
        const matchesTarget = (item.id && grp.querySelector('#' + item.id)) ||
                              (item.name && grp.querySelector('[name="' + item.name + '"]')) ||
                              (grp.id && grp.id === item.groupId);
        if (matchesTarget) {
          grp.classList.remove('sr-only');
          grp.style.display = 'flex';
          const input = grp.querySelector('input, textarea');
          if (input) {
            input.tabIndex = 0;
            if (formData.contact && formData.contact[item.field]) {
              input.value = formData.contact[item.field];
            }
            setTimeout(() => input.focus(), 350);
          }
        } else {
          grp.classList.add('sr-only');
          grp.style.display = '';
          const input = grp.querySelector('input, textarea');
          if (input) input.tabIndex = -1;
        }
      });

      const errorEl = document.getElementById('input-error-message');
      if (errorEl) {
        errorEl.classList.remove('visible');
        errorEl.textContent = '';
      }
    }
  } else {
    // Steps 1–4: Standard Subtitle & Selection Button
    if (form) {
      form.style.display = 'none';
    }

    let sub = document.getElementById('main-subtitle');
    if (!sub) {
      sub = document.createElement('p');
      sub.className = 'main-subtitle';
      sub.id = 'main-subtitle';
      container.prepend(sub);
    }
    sub.style.display = 'block';
    sub.textContent = item.subtitle || item.title || '';

    let selectBtn = document.getElementById('select-option-btn');
    if (!selectBtn) {
      selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'select-option-btn';
      selectBtn.id = 'select-option-btn';
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof gsap !== 'undefined') {
          gsap.to(selectBtn, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
        }
        if (isAnimating) {
          gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
          isAnimating = false;
        }
        selectOption(activeStep, activeOption);
        updateReceipt();
        advanceToNextStep();
      });
      container.appendChild(selectBtn);
    }
    updateSelectOptionButtonState();
  }
}

// 7. STEP 5 STRICT INPUT VALIDATION & ERROR SIGNALS
function validateStep5CurrentOption(shouldShake = true) {
  const item = formSteps[5][activeOption];
  if (!item) return true;

  const errorEl = document.getElementById('input-error-message');
  const inputEl = (item.id ? document.getElementById(item.id) : null) || 
                  document.getElementById('step5-input') || 
                  document.querySelector('#contact-autofill-form .input-group:not(.sr-only) input');
  const textareaEl = document.getElementById('user-notes') || document.getElementById('step5-textarea');

  // Option 7 (Submit Button)
  if (item.inputType === 'button') {
    triggerFinalReview();
    return true;
  }

  // Option 6 (Textarea): Optional, but if entered, must not exceed 500 characters
  if (item.inputType === 'textarea') {
    if (!textareaEl) return true;
    const notesVal = textareaEl.value;
    if (notesVal.length > 500) {
      isAnimating = false;
      const errorMsg = 'Please keep your notes under 500 characters.';
      if (errorEl) {
        errorEl.textContent = errorMsg;
        errorEl.classList.add('visible');
      }
      textareaEl.classList.add('invalid');
      textareaEl.style.border = '1px solid #EA4335';
      textareaEl.style.color = '#FFFFFF';

      if (shouldShake && typeof gsap !== 'undefined') {
        gsap.fromTo([textareaEl, errorEl].filter(Boolean),
          { x: -10 },
          { x: 10, duration: 0.08, repeat: 5, yoyo: true, clearProps: 'x' }
        );
      }
      return false;
    }

    // Success State
    if (errorEl) {
      errorEl.classList.remove('visible');
      errorEl.textContent = '';
    }
    textareaEl.classList.remove('invalid');
    textareaEl.style.border = '';
    textareaEl.style.color = '';
    formData.contact[item.field] = notesVal.trim();
    if (notesVal.trim()) {
      formData[`contact_${item.field}`] = notesVal.trim();
    }
    return true;
  }

  if (!inputEl) return true;

  const val = inputEl.value.trim();
  let isValid = true;
  let errorMsg = '';

  // Required Validations by Input Step:
  // Option 1 (Name): Cannot be empty or whitespace only. Minimum 2 characters.
  if (activeOption === 0) {
    if (val.length < 2) {
      isValid = false;
      errorMsg = 'Please enter your full name.';
    }
  } 
  // Option 2 (Company Name): Cannot be empty or whitespace only.
  else if (activeOption === 1) {
    if (val.length === 0) {
      isValid = false;
      errorMsg = 'Please enter your company or organization name.';
    }
  } 
  // Option 3 (Email): Must pass strict regex check: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  else if (activeOption === 2) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      isValid = false;
      errorMsg = 'Please enter a valid email address (e.g., name@company.com).';
    }
  } 
  // Option 4 (Phone Number): Auto-format as user types into (XXX) XXX-XXXX. Must have exactly 10 digits.
  else if (activeOption === 3) {
    let digits = val.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }
    if (digits.length !== 10) {
      isValid = false;
      errorMsg = 'Please enter a valid 10-digit phone number.';
    }
  } 
  // Option 5 (Website URL): Must match URL structure, allow prefix omission
  else if (activeOption === 4) {
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!urlPattern.test(val)) {
      isValid = false;
      errorMsg = 'Please enter a valid website URL (e.g., www.company.com).';
    }
  }

  // Error State Trigger:
  if (!isValid) {
    isAnimating = false;
    if (errorEl) {
      errorEl.textContent = errorMsg;
      errorEl.classList.add('visible');
    }
    inputEl.classList.add('invalid');
    inputEl.style.borderBottom = '2px solid #EA4335';
    inputEl.style.color = '#FFFFFF';

    if (shouldShake && typeof gsap !== 'undefined') {
      gsap.fromTo([inputEl, errorEl].filter(Boolean),
        { x: -10 },
        { x: 10, duration: 0.08, repeat: 5, yoyo: true, clearProps: 'x' }
      );
    }
    return false;
  }

  // Success State:
  if (errorEl) {
    errorEl.classList.remove('visible');
    errorEl.textContent = '';
  }
  inputEl.classList.remove('invalid');
  inputEl.style.borderBottom = '';
  inputEl.style.color = '';
  formData.contact[item.field] = val;
  if (val) {
    formData[`contact_${item.field}`] = val;
  }
  return true;
}

// 8. 3-POINT DATA MAPPING (INFINITE LOOP MODULO MATH)
function getSlotsData(step, optionIndex) {
  const data = formSteps[step] || formSteps[1];
  const len = data.length;
  const prevIndex = (optionIndex - 1 + len) % len;
  const nextIndex = (optionIndex + 1) % len;
  const prevItem = data[prevIndex];
  const activeItem = data[optionIndex] || data[0];
  const nextItem = data[nextIndex];
  return { prevItem, activeItem, nextItem, prevIndex, nextIndex };
}

// Helper: Build stage image element for GSAP Flip
function createStageImage(step, optionIndex, item, id) {
  const img = document.createElement('img');
  img.src = item.imagePath || item.image || '';
  img.className = 'stage-img';
  if (id) img.id = id;
  img.setAttribute('data-flip-id', `img-${step}-${optionIndex}`);
  img.alt = item.title || '';
  img.decoding = 'async';
  return img;
}

// 8. RENDER ALL 3 SPATIAL SLOTS IN PLACE
function renderSlots(step, optionIndex) {
  const { prevItem, activeItem, nextItem, prevIndex, nextIndex } = getSlotsData(step, optionIndex);
  const currentStepData = formSteps[step];
  const activeBgColor = currentStepData[optionIndex].bgColor || currentStepData[optionIndex].color || '#E37400';

  // Clean up any stray flying clones
  const flyers = document.querySelectorAll('.flip-flying-clone');
  flyers.forEach((el) => el.remove());

  // DOM Update: Explicitly update CSS variable on the full-screen glow element
  const bgGlow = document.getElementById('bg-glow');
  if (bgGlow) {
    bgGlow.style.setProperty('--active-glow-color', activeBgColor);
    bgGlow.style.backgroundColor = activeBgColor;
  }
  updateActiveGlowColor(activeBgColor);

  // Left Step Info
  const stepNumEl = document.getElementById('step-num');
  const stepNameEl = document.getElementById('step-name');
  const stepDescEl = document.querySelector('.step-description') || document.getElementById('step-description');
  if (stepNumEl) stepNumEl.textContent = activeItem.stepNum;
  if (stepNameEl) stepNameEl.textContent = activeItem.stepName;
  if (stepDescEl) {
    const meta = stepMetadata[step - 1];
    stepDescEl.textContent = meta ? meta.description : (activeItem.description || '');
  }
  updateNavPill(step);

  // Center Stage (.active-stage .img-slot & .stage-title)
  const centerSlot = document.querySelector('.active-stage .img-slot');
  const stageTitle = document.querySelector('.active-stage .stage-title');
  if (centerSlot) {
    centerSlot.innerHTML = '';
    const centerImg = createStageImage(step, optionIndex, activeItem, 'center-img');
    centerSlot.appendChild(centerImg);
  }
  if (stageTitle) {
    stageTitle.textContent = activeItem.title || '';
    gsap.set(stageTitle, { opacity: 1 });
  }

  // Top-Left Slot (.prev-thumbnail .img-slot & .thumbnail-label)
  const prevSlotWrap = document.getElementById('prev-slot-wrap');
  const prevSlot = document.querySelector('.prev-thumbnail .img-slot');
  const prevLabel = document.querySelector('.prev-thumbnail .thumbnail-label');
  if (prevSlot) {
    prevSlot.innerHTML = '';
    const prevImg = createStageImage(step, prevIndex, prevItem, 'prev-img');
    prevSlot.appendChild(prevImg);
  }
  if (prevLabel) {
    prevLabel.textContent = prevItem.title || '';
    gsap.set(prevLabel, { opacity: 1 });
  }
  if (prevSlotWrap) {
    prevSlotWrap.style.opacity = '1';
    prevSlotWrap.style.pointerEvents = 'auto';
  }

  // Bottom-Right Slot (.next-thumbnail .img-slot & .thumbnail-label)
  const nextSlotWrap = document.getElementById('next-slot-wrap');
  const nextSlot = document.querySelector('.next-thumbnail .img-slot');
  const nextLabel = document.querySelector('.next-thumbnail .thumbnail-label');
  if (nextSlot) {
    nextSlot.innerHTML = '';
    const nextImg = createStageImage(step, nextIndex, nextItem, 'next-img');
    nextSlot.appendChild(nextImg);
  }
  if (nextLabel) {
    nextLabel.textContent = nextItem.title || '';
    gsap.set(nextLabel, { opacity: 1 });
  }
  if (nextSlotWrap) {
    nextSlotWrap.style.opacity = '1';
    nextSlotWrap.style.pointerEvents = 'auto';
  }

  renderCenterSubtitleOrInput(activeItem);
}

// 9. NAVIGATION — NEXT (DECOUPLED 120HZ IMAGE FLIGHT + TEXT CROSSFADE)
function triggerNextOption() {
  const currentStepArray = formSteps[activeStep];
  if (!currentStepArray || currentStepArray.length === 0) return;

  // On Step 5: Enforce strict validation of current input before advancing to next option
  if (activeStep === 5) {
    const valid = validateStep5CurrentOption(true);
    if (!valid) {
      isAnimating = false;
      return;
    }
    if (activeOption >= currentStepArray.length - 2) {
      triggerFinalReview();
      return;
    }
  }

  // Prevent queuing and kill in-flight tweens on spam-clicks
  if (isAnimating) {
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
    }
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  isAnimating = true;

  const len = currentStepArray.length;
  const newActiveIndex = (activeOption + 1) % len;
  activeOption = newActiveIndex;

  const newActiveItem = currentStepArray[newActiveIndex];
  const targetBgColor = newActiveItem.bgColor || newActiveItem.color || '#E37400';

  // Dynamic Background Glow Color Morph
  updateActiveGlowColor(targetBgColor);

  // Synchronous text / subtitle crossfade
  const centerTextGroup = document.getElementById('center-text-group');
  if (centerTextGroup) {
    gsap.to(centerTextGroup, {
      opacity: 0,
      y: -8,
      duration: 0.12,
      ease: 'power2.in',
      overwrite: "auto",
      onComplete: () => {
        renderCenterSubtitleOrInput(newActiveItem);
        const stepNumEl = document.getElementById('step-num');
        const stepNameEl = document.getElementById('step-name');
        const stepDescEl = document.querySelector('.step-description') || document.getElementById('step-description');
        if (stepNumEl) stepNumEl.textContent = newActiveItem.stepNum;
        if (stepNameEl) stepNameEl.textContent = newActiveItem.stepName;
        if (stepDescEl) {
          const meta = stepMetadata[activeStep - 1];
          stepDescEl.textContent = meta ? meta.description : (newActiveItem.description || '');
        }
        gsap.to(centerTextGroup, {
          opacity: 1,
          y: 0,
          duration: 0.2,
          ease: 'power2.out',
          overwrite: "auto",
          onComplete: () => {
            gsap.set(centerTextGroup, { clearProps: "willChange" });
          }
        });
      }
    });
  } else {
    renderCenterSubtitleOrInput(newActiveItem);
  }

  // Fallback for reduced motion or missing Flip
  if (typeof Flip === 'undefined' || !Flip.getState || isReducedMotion()) {
    renderSlots(activeStep, activeOption);
    isAnimating = false;
    return;
  }

  try {
    // 1. Track ONLY the images
    const state = Flip.getState('.stage-img'); 

    const prevContainer = document.querySelector('.prev-thumbnail .img-slot');
    const centerContainer = document.querySelector('.active-stage .img-slot');
    const nextContainer = document.querySelector('.next-thumbnail .img-slot');

    // 2. Crossfade out the text labels
    gsap.to(['.active-stage .stage-title', '.next-thumbnail .thumbnail-label', '.prev-thumbnail .thumbnail-label'], { opacity: 0, duration: 0.12, overwrite: "auto" });

    // 3. Safely Reparent Images (DOM Move)
    if (prevContainer && prevContainer.querySelector('img')) {
      prevContainer.innerHTML = '';
    }
    
    const activeImg = centerContainer ? centerContainer.querySelector('img') : null;
    if (activeImg && prevContainer) prevContainer.appendChild(activeImg);
    
    const nextImg = nextContainer ? nextContainer.querySelector('img') : null;
    if (nextImg && centerContainer) centerContainer.appendChild(nextImg);

    // 4. Inject NEW Incoming Image (into Next slot)
    const newNextIndex = (activeOption + 1) % len;
    const newPrevIndex = (activeOption - 1 + len) % len;
    if (nextContainer && currentStepArray[newNextIndex]) {
      const nextOptionData = currentStepArray[newNextIndex];
      const newImg = document.createElement('img');
      newImg.src = nextOptionData.imagePath || nextOptionData.image || '';
      newImg.className = 'stage-img';
      newImg.id = 'next-img';
      newImg.setAttribute('data-flip-id', `img-${activeStep}-${newNextIndex}`);
      newImg.alt = nextOptionData.title || '';
      nextContainer.appendChild(newImg);
    }

    // 5. Update Text Content (While invisible)
    setTimeout(() => {
      const stageTitle = document.querySelector('.active-stage .stage-title');
      const nextLabel = document.querySelector('.next-thumbnail .thumbnail-label');
      const prevLabel = document.querySelector('.prev-thumbnail .thumbnail-label');
      if (stageTitle) stageTitle.textContent = currentStepArray[activeOption].title || '';
      if (nextLabel) nextLabel.textContent = currentStepArray[newNextIndex].title || '';
      if (prevLabel) prevLabel.textContent = currentStepArray[newPrevIndex].title || '';

      // Fade text back in
      gsap.to(['.active-stage .stage-title', '.next-thumbnail .thumbnail-label', '.prev-thumbnail .thumbnail-label'], { opacity: 1, duration: 0.2, overwrite: "auto" });
    }, 120);

    // 6. Execute Image Flight
    Flip.from(state, {
      duration: 0.32,
      ease: "power2.out",
      absolute: true, 
      scale: true,
      zIndex: 100,
      overwrite: "auto",
      onEnter: (elements) => {
        return gsap.fromTo(elements,
          { opacity: 0, scale: 0.8 },
          { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out", overwrite: "auto" }
        );
      },
      onComplete: () => { 
        isAnimating = false; 
        gsap.set('.stage-img', { clearProps: "willChange" });
      }
    });
  } catch (err) {
    console.warn('Flip animation failed, falling back to renderSlots:', err);
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  setTimeout(() => { 
    isAnimating = false; 
    gsap.set('.stage-img', { clearProps: "willChange" });
  }, 350);
}

// 10. NAVIGATION — PREVIOUS (DECOUPLED 120HZ IMAGE FLIGHT + TEXT CROSSFADE)
function triggerPrevOption() {
  const currentStepArray = formSteps[activeStep];
  if (!currentStepArray || currentStepArray.length === 0) return;

  // Prevent queuing and kill in-flight tweens on spam-clicks
  if (isAnimating) {
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
    }
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  isAnimating = true;

  const len = currentStepArray.length;
  const newActiveIndex = (activeOption - 1 + len) % len;
  activeOption = newActiveIndex;

  const newActiveItem = currentStepArray[newActiveIndex];
  const targetBgColor = newActiveItem.bgColor || newActiveItem.color || '#E37400';

  // Dynamic Background Glow Color Morph
  updateActiveGlowColor(targetBgColor);

  // Synchronous text / subtitle crossfade
  const centerTextGroup = document.getElementById('center-text-group');
  if (centerTextGroup) {
    gsap.to(centerTextGroup, {
      opacity: 0,
      y: 8,
      duration: 0.12,
      ease: 'power2.in',
      overwrite: "auto",
      onComplete: () => {
        renderCenterSubtitleOrInput(newActiveItem);
        const stepNumEl = document.getElementById('step-num');
        const stepNameEl = document.getElementById('step-name');
        const stepDescEl = document.querySelector('.step-description') || document.getElementById('step-description');
        if (stepNumEl) stepNumEl.textContent = newActiveItem.stepNum;
        if (stepNameEl) stepNameEl.textContent = newActiveItem.stepName;
        if (stepDescEl) {
          const meta = stepMetadata[activeStep - 1];
          stepDescEl.textContent = meta ? meta.description : (newActiveItem.description || '');
        }
        gsap.to(centerTextGroup, {
          opacity: 1,
          y: 0,
          duration: 0.2,
          ease: 'power2.out',
          overwrite: "auto",
          onComplete: () => {
            gsap.set(centerTextGroup, { clearProps: "willChange" });
          }
        });
      }
    });
  } else {
    renderCenterSubtitleOrInput(newActiveItem);
  }

  // Fallback for reduced motion or missing Flip
  if (typeof Flip === 'undefined' || !Flip.getState || isReducedMotion()) {
    renderSlots(activeStep, activeOption);
    isAnimating = false;
    return;
  }

  try {
    // 1. Track ONLY the images
    const state = Flip.getState('.stage-img'); 

    const prevContainer = document.querySelector('.prev-thumbnail .img-slot');
    const centerContainer = document.querySelector('.active-stage .img-slot');
    const nextContainer = document.querySelector('.next-thumbnail .img-slot');

    // 2. Crossfade out the text labels
    gsap.to(['.active-stage .stage-title', '.next-thumbnail .thumbnail-label', '.prev-thumbnail .thumbnail-label'], { opacity: 0, duration: 0.12, overwrite: "auto" });

    // 3. Safely Reparent Images (DOM Move) - Inverse for Prev
    if (nextContainer && nextContainer.querySelector('img')) {
      nextContainer.innerHTML = '';
    }
    
    const activeImg = centerContainer ? centerContainer.querySelector('img') : null;
    if (activeImg && nextContainer) nextContainer.appendChild(activeImg);
    
    const prevImg = prevContainer ? prevContainer.querySelector('img') : null;
    if (prevImg && centerContainer) centerContainer.appendChild(prevImg);

    // 4. Inject NEW Incoming Image (into Prev slot)
    const newPrevIndex = (activeOption - 1 + len) % len;
    const newNextIndex = (activeOption + 1) % len;
    if (prevContainer && currentStepArray[newPrevIndex]) {
      const prevOptionData = currentStepArray[newPrevIndex];
      const newImg = document.createElement('img');
      newImg.src = prevOptionData.imagePath || prevOptionData.image || '';
      newImg.className = 'stage-img';
      newImg.id = 'prev-img';
      newImg.setAttribute('data-flip-id', `img-${activeStep}-${newPrevIndex}`);
      newImg.alt = prevOptionData.title || '';
      prevContainer.appendChild(newImg);
    }

    // 5. Update Text Content (While invisible)
    setTimeout(() => {
      const stageTitle = document.querySelector('.active-stage .stage-title');
      const nextLabel = document.querySelector('.next-thumbnail .thumbnail-label');
      const prevLabel = document.querySelector('.prev-thumbnail .thumbnail-label');
      if (stageTitle) stageTitle.textContent = currentStepArray[activeOption].title || '';
      if (nextLabel) nextLabel.textContent = currentStepArray[newNextIndex].title || '';
      if (prevLabel) prevLabel.textContent = currentStepArray[newPrevIndex].title || '';

      // Fade text back in
      gsap.to(['.active-stage .stage-title', '.next-thumbnail .thumbnail-label', '.prev-thumbnail .thumbnail-label'], { opacity: 1, duration: 0.2, overwrite: "auto" });
    }, 120);

    // 6. Execute Image Flight
    Flip.from(state, {
      duration: 0.32,
      ease: "power2.out",
      absolute: true, 
      scale: true,
      zIndex: 100,
      overwrite: "auto",
      onEnter: (elements) => {
        return gsap.fromTo(elements,
          { opacity: 0, scale: 0.8 },
          { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out", overwrite: "auto" }
        );
      },
      onComplete: () => { 
        isAnimating = false; 
        gsap.set('.stage-img', { clearProps: "willChange" });
      }
    });
  } catch (err) {
    console.warn('Flip animation failed, falling back to renderSlots:', err);
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  setTimeout(() => { 
    isAnimating = false; 
    gsap.set('.stage-img', { clearProps: "willChange" });
  }, 350);
}

// 50ms physical click recoil helper for carousel navigation
function applyNavRecoil(btn) {
  if (!btn) return;
  btn.classList.add('is-pressed');
  if (typeof gsap !== 'undefined') {
    gsap.to(btn, { scale: 0.92, duration: 0.05, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto" });
  }
  setTimeout(() => {
    btn.classList.remove('is-pressed');
  }, 50);
}
window.applyNavRecoil = applyNavRecoil;

// Navigation Actions Wired Directly to Keyboard Arrow Logic (Zero-Latency Audio, 50ms Recoil & State Cycles)
function navigateNext() {
  // 1. Zero-latency navigation audio
  if (typeof playTick === 'function') {
    playTick();
  } else if (typeof playNavSound === 'function') {
    playNavSound();
  }

  // 2. Physical 50ms recoil on the on-screen next button
  const nextBtn = document.getElementById('nav-arrow-next');
  if (nextBtn) {
    applyNavRecoil(nextBtn);
  }

  // 3. Start experience / dismiss welcome overlay if still active
  if (!appStarted && typeof startExperience === 'function') {
    startExperience();
  }

  // 4. Fast cycling: kill in-flight tweens on rapid clicks
  if (isAnimating) {
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
    }
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  // 5. Trigger next option
  triggerNextOption();
}

function navigatePrev() {
  // 1. Zero-latency navigation audio
  if (typeof playTick === 'function') {
    playTick();
  } else if (typeof playNavSound === 'function') {
    playNavSound();
  }

  // 2. Physical 50ms recoil on the on-screen prev button
  const prevBtn = document.getElementById('nav-arrow-prev');
  if (prevBtn) {
    applyNavRecoil(prevBtn);
  }

  // 3. Start experience / dismiss welcome overlay if still active
  if (!appStarted && typeof startExperience === 'function') {
    startExperience();
  }

  // 4. Fast cycling: kill in-flight tweens on rapid clicks
  if (isAnimating) {
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
    }
    renderSlots(activeStep, activeOption);
    isAnimating = false;
  }

  // 5. Trigger prev option
  triggerPrevOption();
}

// Carousel / Step Navigation Handler
function handleNavigation(direction) {
  if (direction === 'next') {
    navigateNext();
  } else {
    navigatePrev();
  }
}
window.navigateNext = navigateNext;
window.navigatePrev = navigatePrev;
window.handleNavigation = handleNavigation;
window.navigatePrev = navigatePrev;
window.handleNavigation = handleNavigation;

function updateDisplay(index) {
  if (typeof index === 'number') {
    const currentStepArray = formSteps[activeStep];
    if (currentStepArray && currentStepArray.length > 0) {
      activeOption = ((index % currentStepArray.length) + currentStepArray.length) % currentStepArray.length;
    }
  }
  renderSlots(activeStep, activeOption);
}
window.updateDisplay = updateDisplay;

// 11. SUBMIT STEP / PROGRESSION VALIDATION (STEPS 1-4 & STEP 5)
function submitStep() {
  if (isAnimating) return;

  // On Step 5: Validate current field
  if (activeStep === 5) {
    const valid = validateStep5CurrentOption();
    if (valid) {
      if (activeOption >= formSteps[5].length - 2) {
        triggerFinalReview();
      } else {
        triggerNextOption();
      }
    }
    return;
  }

  // Ensure current active option is selected if not already explicitly selected
  if (stepSelections[activeStep] === null || stepSelections[activeStep] === undefined) {
    selectOption(activeStep, activeOption);
    updateReceipt();
  } else if (activeStep >= 1 && activeStep <= 4) {
    const activeImg = document.querySelector('.active-stage .img-slot img') || document.getElementById('center-img');
    const capturedSrc = (activeImg && activeImg.src)
      ? activeImg.src
      : (formSteps[activeStep] && formSteps[activeStep][activeOption] ? (formSteps[activeStep][activeOption].imagePath || formSteps[activeStep][activeOption].image || '') : '');

    if (activeStep === 1) formData.industryImage = capturedSrc;
    if (activeStep === 2) {
      formData.sizeImage = capturedSrc;
      formData.companySizeImage = capturedSrc;
    }
    if (activeStep === 3) formData.revenueImage = capturedSrc;
    if (activeStep === 4) formData.bottleneckImage = capturedSrc;
  }

  if (activeStep >= totalSteps) return;

  isAnimating = true;

  const nextStep = activeStep + 1;
  const nextOption = 0;
  const currentStepData = formSteps[nextStep];
  const targetItem = currentStepData[nextOption];
  const targetBgColor = targetItem.bgColor || targetItem.color || '#202124';

  const centerStage = document.querySelector('.active-stage') || document.getElementById('center-img-wrap');
  const centerTextGroup = document.getElementById('center-text-group');
  const stepCol = document.getElementById('step-col');
  const prevSlotWrap = document.getElementById('prev-slot-wrap');
  const nextSlotWrap = document.getElementById('next-slot-wrap');

  const tl = gsap.timeline({
    onComplete: () => {
      activeStep = nextStep;
      activeOption = nextOption;
      renderSlots(activeStep, activeOption);
      isAnimating = false;
      gsap.set([centerStage, centerTextGroup, stepCol, prevSlotWrap, nextSlotWrap, '.stage-img'].filter(Boolean), { clearProps: "willChange" });
    }
  });

  // DOM Update: Explicitly update CSS variable on #bg-glow
  const bgGlow = document.getElementById('bg-glow');
  if (bgGlow) {
    bgGlow.style.setProperty('--active-glow-color', targetBgColor);
    bgGlow.style.backgroundColor = targetBgColor;
  }
  updateActiveGlowColor(targetBgColor, tl, 0);

  tl.to([centerStage, centerTextGroup, stepCol, prevSlotWrap, nextSlotWrap].filter(Boolean), {
    opacity: 0,
    y: -15,
    duration: isReducedMotion() ? 0 : 0.2,
    ease: 'power2.in',
    overwrite: "auto"
  }, 0);

  tl.add(() => {
    activeStep = nextStep;
    activeOption = nextOption;
    renderSlots(activeStep, activeOption);
    const newCenterStage = document.querySelector('.active-stage') || document.getElementById('center-img-wrap');
    const newCenterTextGroup = document.getElementById('center-text-group');
    const newStepCol = document.getElementById('step-col');
    const newNextSlotWrap = document.getElementById('next-slot-wrap');
    gsap.set([newCenterStage, newCenterTextGroup, newStepCol, newNextSlotWrap].filter(Boolean), { y: 15, opacity: 0 });
    gsap.to([newCenterStage, newCenterTextGroup, newStepCol, newNextSlotWrap].filter(Boolean), {
      opacity: 1,
      y: 0,
      duration: isReducedMotion() ? 0 : 0.25,
      ease: 'power2.out',
      overwrite: "auto"
    });
  }, 0.2);

  setTimeout(() => { isAnimating = false; }, 480);
}

// 12. RETURN STEP (BACKSPACE KEY)
function returnStep() {
  if (isAnimating) return;

  // On Step 5, if on option > 0, return to previous input field
  if (activeStep === 5 && activeOption > 0) {
    triggerPrevOption();
    return;
  }

  if (activeStep <= 1) return;
  isAnimating = true;

  const prevStep = activeStep - 1;
  const prevOption = (stepSelections[prevStep] !== null && stepSelections[prevStep] !== undefined)
    ? stepSelections[prevStep]
    : 0;
  const currentStepData = formSteps[prevStep];
  const targetItem = currentStepData[prevOption];
  const targetBgColor = targetItem.bgColor || targetItem.color || '#202124';

  const centerStage = document.querySelector('.active-stage') || document.getElementById('center-img-wrap');
  const centerTextGroup = document.getElementById('center-text-group');
  const stepCol = document.getElementById('step-col');
  const prevSlotWrap = document.getElementById('prev-slot-wrap');
  const nextSlotWrap = document.getElementById('next-slot-wrap');

  const tl = gsap.timeline({
    onComplete: () => {
      activeStep = prevStep;
      activeOption = prevOption;
      renderSlots(activeStep, activeOption);
      isAnimating = false;
      gsap.set([centerStage, centerTextGroup, stepCol, prevSlotWrap, nextSlotWrap, '.stage-img'].filter(Boolean), { clearProps: "willChange" });
    }
  });

  // DOM Update: Explicitly update CSS variable on #bg-glow
  const bgGlow = document.getElementById('bg-glow');
  if (bgGlow) {
    bgGlow.style.setProperty('--active-glow-color', targetBgColor);
    bgGlow.style.backgroundColor = targetBgColor;
  }
  updateActiveGlowColor(targetBgColor, tl, 0);

  tl.to([centerStage, centerTextGroup, stepCol, prevSlotWrap, nextSlotWrap].filter(Boolean), {
    opacity: 0,
    y: 15,
    duration: isReducedMotion() ? 0 : 0.2,
    ease: 'power2.in',
    overwrite: "auto"
  }, 0);

  tl.add(() => {
    activeStep = prevStep;
    activeOption = prevOption;
    renderSlots(activeStep, activeOption);
    const newCenterStage = document.querySelector('.active-stage') || document.getElementById('center-img-wrap');
    const newCenterTextGroup = document.getElementById('center-text-group');
    const newStepCol = document.getElementById('step-col');
    const newPrevSlotWrap = document.getElementById('prev-slot-wrap');
    const newNextSlotWrap = document.getElementById('next-slot-wrap');
    gsap.set([newCenterStage, newCenterTextGroup, newStepCol, newPrevSlotWrap, newNextSlotWrap].filter(Boolean), { y: -15, opacity: 0 });
    gsap.to([newCenterStage, newCenterTextGroup, newStepCol, newPrevSlotWrap, newNextSlotWrap].filter(Boolean), {
      opacity: 1,
      y: 0,
      duration: isReducedMotion() ? 0 : 0.25,
      ease: 'power2.out',
      overwrite: "auto"
    });
  }, 0.2);

  setTimeout(() => { isAnimating = false; }, 480);
}

// 13. DIRECT STEP SWITCH (TOP NAV PILL CLICK)
function switchStepDirect(targetStep) {
  if (isAnimating || targetStep === activeStep) return;
  if (!formSteps[targetStep]) return;

  // Validation: If jumping forward beyond current progress without selection, block
  if (targetStep > activeStep && (stepSelections[activeStep] === null || stepSelections[activeStep] === undefined)) {
    gsap.fromTo('.active-stage', { x: -10 }, { x: 10, clearProps: 'x', repeat: 3, yoyo: true, duration: 0.08, overwrite: "auto" });
    return;
  }

  const targetOption = (targetStep === 5)
    ? 0
    : (stepSelections[targetStep] !== null ? stepSelections[targetStep] : 0);

  activeStep = targetStep;
  activeOption = targetOption;
  renderSlots(activeStep, activeOption);
}

// 13b. FULL-SCREEN REVIEW & FINAL SUBMIT INTERCEPT
function triggerFinalReview() {
  isAnimating = false;

  // 1. Hide the main UI with 120Hz performance compliance
  gsap.to(['#content-grid', '.prev-thumbnail', '.next-thumbnail', '.prev-slot-wrap', '.next-slot-wrap', 'header'].filter(Boolean), {
    opacity: 0, 
    duration: isReducedMotion() ? 0 : 0.5, 
    onComplete: () => {
      const grid = document.getElementById('content-grid');
      if (grid) grid.style.display = 'none';
      const prev = document.getElementById('prev-slot-wrap');
      if (prev) prev.style.display = 'none';
      const next = document.getElementById('next-slot-wrap');
      if (next) next.style.display = 'none';
      const hdr = document.querySelector('header');
      if (hdr) hdr.style.display = 'none';
    }
  });

  // Synchronize contact form inputs from DOM into formData if present
  const nameInp = document.getElementById('user-name');
  const orgInp = document.getElementById('user-organization');
  const emailInp = document.getElementById('user-email');
  const phoneInp = document.getElementById('user-phone');
  const webInp = document.getElementById('user-website');
  const notesInp = document.getElementById('user-notes') || document.getElementById('step5-textarea');

  if (formData.contact) {
    if (nameInp && nameInp.value.trim()) formData.contact.name = nameInp.value.trim();
    if (orgInp && orgInp.value.trim()) formData.contact.company = orgInp.value.trim();
    if (emailInp && emailInp.value.trim()) formData.contact.email = emailInp.value.trim();
    if (phoneInp && phoneInp.value.trim()) formData.contact.phone = phoneInp.value.trim();
    if (webInp && webInp.value.trim()) formData.contact.website = webInp.value.trim();
    if (notesInp && notesInp.value.trim()) formData.contact.additionalNotes = notesInp.value.trim();
  }

  // 2. Map payload data into the 10 UI pills based on exact structure
  const reviewList = document.getElementById('full-review-list');
  if (reviewList) {
    reviewList.innerHTML = '';

    const valStep1 = (formData[1] && formData[1].title) || (formSteps[1] && formSteps[1][stepSelections[1] !== null && stepSelections[1] !== undefined ? stepSelections[1] : 0]?.title) || 'Roofing & Solar';
    const valStep2 = (formData[2] && formData[2].title) || (formSteps[2] && formSteps[2][stepSelections[2] !== null && stepSelections[2] !== undefined ? stepSelections[2] : 0]?.title) || '1-5 EMPLOYEES';
    const valStep3 = (formData[3] && formData[3].title) || (formSteps[3] && formSteps[3][stepSelections[3] !== null && stepSelections[3] !== undefined ? stepSelections[3] : 0]?.title) || 'Under $50k/mo';
    const valStep4 = (formData[4] && formData[4].title) || (formSteps[4] && formSteps[4][stepSelections[4] !== null && stepSelections[4] !== undefined ? stepSelections[4] : 0]?.title) || 'No automated follow-ups';

    const valName = (formData.contact && formData.contact.name) || formData.contact_name || (nameInp && nameInp.value.trim()) || 'Dinesh Kumar';
    const valEmail = (formData.contact && formData.contact.email) || formData.contact_email || (emailInp && emailInp.value.trim()) || 'mail.to.dinesh.21@gmail.com';
    const valOrg = (formData.contact && formData.contact.company) || formData.contact_company || (orgInp && orgInp.value.trim()) || 'Magikscill';
    const valPhone = (formData.contact && formData.contact.phone) || formData.contact_phone || (phoneInp && phoneInp.value.trim()) || '(884) 063-9812';
    const valWeb = (formData.contact && formData.contact.website) || formData.contact_website || (webInp && webInp.value.trim()) || 'magiskcill.com';
    const valNotes = (formData.contact && formData.contact.additionalNotes) || formData.contact_additionalNotes || (notesInp && notesInp.value.trim()) || 'nothing to tell yo boss !';

    const reviewItems = [
      {
        position: 1,
        type: 'Step 1 (Industry)',
        label: 'Industry',
        value: valStep1,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Building%20construction/3D/building_construction_3d.png'
      },
      {
        position: 2,
        type: 'Step 2 (Size)',
        label: 'Company Size',
        value: valStep2,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Busts%20in%20silhouette/3D/busts_in_silhouette_3d.png'
      },
      {
        position: 3,
        type: 'Step 3 (Revenue)',
        label: 'Monthly Revenue',
        value: valStep3,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Money%20bag/3D/money_bag_3d.png'
      },
      {
        position: 4,
        type: 'Step 4 (Bottleneck)',
        label: 'Primary Bottleneck',
        value: valStep4,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Hourglass%20done/3D/hourglass_done_3d.png'
      },
      {
        position: 5,
        type: 'Step 5 (Name)',
        label: 'Full Name',
        value: valName,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Identification%20card/3D/identification_card_3d.png'
      },
      {
        position: 6,
        type: 'Step 5 (Email)',
        label: 'Work Email',
        value: valEmail,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Envelope/3D/envelope_3d.png'
      },
      {
        position: 7,
        type: 'Step 5 (Company)',
        label: 'Company Name',
        value: valOrg,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Office%20building/3D/office_building_3d.png'
      },
      {
        position: 8,
        type: 'Step 5 (Phone)',
        label: 'Phone Number',
        value: valPhone,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Mobile%20phone/3D/mobile_phone_3d.png'
      },
      {
        position: 9,
        type: 'Step 5 (Website)',
        label: 'Website URL',
        value: valWeb,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Globe%20with%20meridians/3D/globe_with_meridians_3d.png'
      },
      {
        position: 10,
        type: 'Step 5 (Notes)',
        label: 'Additional Notes',
        value: valNotes,
        iconUrl: 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Clipboard/3D/clipboard_3d.png'
      }
    ];

    reviewItems.forEach((item) => {
      const pill = document.createElement('div');
      pill.className = 'data-pill';
      pill.setAttribute('data-position', item.position);
      pill.setAttribute('tabindex', '0');

      pill.innerHTML = `
        <div class="pill-icon" aria-hidden="true">
          <img src="${item.iconUrl}" alt="" class="realistic-icon" loading="lazy" decoding="async">
        </div>
        <div class="pill-body">
          <span class="pill-label data-pill-text">${item.label}</span>
          <span class="pill-value data-pill-text" title="${item.value}">${item.value}</span>
        </div>
      `;

      // 3. Attach to Data Pills (Zero-Latency Audio Engine)
      pill.addEventListener('mouseenter', playTick);
      pill.addEventListener('focus', playTick);

      reviewList.appendChild(pill);
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // Reset submit button and titles to State 0
  const submitBtn = document.getElementById('final-submit-btn') || document.querySelector('.submit-btn');
  if (submitBtn) {
    submitBtn.className = 'btn-primary submit-btn';
    submitBtn.classList.remove('is-loading', 'is-pressed', 'loading', 'success');
    submitBtn.style.pointerEvents = 'auto';
    submitBtn.style.width = '';
    submitBtn.style.height = '';
    submitBtn.style.padding = '';
    submitBtn.style.display = '';
    submitBtn.style.opacity = '1';
    submitBtn.innerHTML = '<span class="btn-text">CONFIRM &amp; SUBMIT</span>';
    submitBtn.setAttribute('aria-label', 'Confirm and submit selections');
  }

  const confirmCard = document.getElementById('confirmation-card');
  if (confirmCard) {
    confirmCard.style.display = 'none';
    confirmCard.style.opacity = '0';
  }

  const titles = document.querySelector('.review-titles');
  if (titles) {
    titles.style.opacity = '1';
    titles.style.display = 'flex';
    gsap.set(titles, { clearProps: "all" });
  }

  // 3. Show the Review Screen
  const reviewScreen = document.getElementById('final-review-screen');
  if (reviewScreen) {
    reviewScreen.style.display = 'flex';
    gsap.to(reviewScreen, { 
      opacity: 1, 
      duration: isReducedMotion() ? 0 : 0.8, 
      delay: isReducedMotion() ? 0 : 0.3,
      onComplete: () => {
        gsap.set(reviewScreen, { clearProps: "willChange" });
      }
    });
  }
}

// 14. FINAL SUBMISSION
function handleFinalSubmit() {
  triggerFinalReview();
}

// 15. WELCOME SCREEN DISMISSAL (State 2: Exit)
function startExperience() {
  if (appStarted) return;
  appStarted = true;
  hoverSound.load();
  confirmSound.load();
  cancelSound.load();

  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.classList.add('is-dismissed');
    welcomeScreen.style.pointerEvents = 'none';
    const prefersReduced = isReducedMotion();

    if (typeof gsap !== 'undefined') {
      gsap.to(welcomeScreen, {
        opacity: 0,
        scale: prefersReduced ? 1 : 0.98,
        duration: prefersReduced ? 0.2 : 0.4,
        ease: 'power2.inOut',
        onComplete: () => {
          welcomeScreen.classList.add('is-dismissed');
          welcomeScreen.style.display = 'none';
          welcomeScreen.style.pointerEvents = 'none';
          welcomeScreen.style.visibility = 'hidden';
          welcomeScreen.style.zIndex = '-9999';
          const appWrapper = document.getElementById('app-wrapper');
          if (appWrapper) appWrapper.focus();
          renderSlots(activeStep, activeOption);
        }
      });
    } else {
      welcomeScreen.classList.add('is-dismissed');
      welcomeScreen.style.opacity = '0';
      welcomeScreen.style.display = 'none';
      welcomeScreen.style.pointerEvents = 'none';
      welcomeScreen.style.visibility = 'hidden';
      welcomeScreen.style.zIndex = '-9999';
      const appWrapper = document.getElementById('app-wrapper');
      if (appWrapper) appWrapper.focus();
      renderSlots(activeStep, activeOption);
    }
  }
}
window.startExperience = startExperience;

// 16. GLOBAL KEYBOARD EVENT LISTENER (STRICT INPUT & ENTER BINDING)
function handleGlobalKeyDown(e) {
  // Fast Hardware Keyboard Handling: Allow rapid cycling without dropping keystrokes
  if (isAnimating) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (typeof gsap !== 'undefined') {
        gsap.killTweensOf(['.stage-img', '#center-text-group', '.stage-title', '.thumbnail-label']);
      }
      renderSlots(activeStep, activeOption);
      isAnimating = false;
    } else {
      if (e.key === 'Enter' || e.key === 'Backspace' || e.key === ' ') {
        e.preventDefault();
      }
      return;
    }
  }

  // If experience hasn't started yet, Enter, Space, Arrows, or Escape dismiss welcome overlay
  if (!appStarted) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      startExperience();
    }
    return;
  }

  const activeEl = document.activeElement;
  const activeTag = activeEl ? activeEl.tagName : '';
  const isInput = (activeTag === 'INPUT');
  const isTextarea = (activeTag === 'TEXTAREA');

  // Input & Textarea keyboard isolation
  if (isInput || isTextarea) {
    // Arrow keys: Strictly allow standard cursor navigation inside input/textarea.
    // NEVER cycle options or advance step.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      return;
    }

    // Backspace: Allow standard character deletion. If empty, navigate to previous field/step.
    if (e.key === 'Backspace') {
      if (activeEl.value === '') {
        e.preventDefault();
        returnStep();
      }
      return;
    }

    // Textarea: Shift+Enter creates a new line
    if (isTextarea && e.key === 'Enter' && e.shiftKey) {
      return;
    }

    // Step 5 Enter Edge Case: Validates the text, saves it, and triggers flip to the next input field
    if (e.key === 'Enter') {
      e.preventDefault();
      const valid = validateStep5CurrentOption();
      if (!valid) return;

      const currentStepArray = formSteps[5];
      if (activeOption === currentStepArray.length - 1) {
        handleFinalSubmit();
      } else {
        triggerNextOption();
      }
      return;
    }

    // Normal typing allowed
    return;
  }

  // Global Navigation Shortcuts (Outside Input / Textarea)
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault();
      navigateNext();
      break;

    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault();
      navigatePrev();
      break;

    case 'Enter':
      e.preventDefault();
      // 3. STEP VALIDATION ENFORCEMENT:
      // If no option is properly centered or is animating, block step advancement
      const currentStepData = formSteps[activeStep];
      if (!currentStepData || activeOption < 0 || activeOption >= currentStepData.length) {
        return;
      }

      if (activeStep < 5) {
        // Enter Rule: Lock activeOption choice, save to formData[activeStep], trigger crossfade to next step.
        // Constraint: NEVER cycle the options.
        selectOption(activeStep, activeOption);
        updateReceipt();
        advanceToNextStep();
      } else if (activeStep === 5) {
        // Step 5 Enter Rule
        const valid = validateStep5CurrentOption();
        if (!valid) return;
        updateReceipt();

        if (activeOption >= currentStepData.length - 2) {
          triggerFinalReview();
        } else {
          triggerNextOption();
        }
      }
      break;

    case 'Backspace':
      e.preventDefault();
      returnStep();
      break;

    case ' ':
      if (activeStep < 5) {
        e.preventDefault();
        selectOption(activeStep, activeOption);
      }
      break;
  }
}

// 17. TOUCH SWIPES (MOBILE)
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e) {
  if (e.changedTouches && e.changedTouches.length > 0) {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }
}

function handleTouchEnd(e) {
  if (isAnimating || !appStarted || !e.changedTouches || e.changedTouches.length === 0) return;
  const touchEndX = e.changedTouches[0].screenX;
  const touchEndY = e.changedTouches[0].screenY;

  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX < 0) {
      triggerNextOption();
    } else {
      triggerPrevOption();
    }
  }
}

// 18. INITIALIZATION ON DOM READY
function initApp() {
  renderSlots(activeStep, activeOption);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  // 3. Attach to Data Pills (Zero-Latency Audio Engine)
  const appDataPills = document.querySelectorAll('.data-pill');
  appDataPills.forEach(pill => {
    pill.addEventListener('mouseenter', playTick);
    pill.addEventListener('focus', playTick);
  });

  // Welcome Screen: State 1 (Mounted) GSAP Entrance Animation
  const welcomeContainer = document.querySelector('.welcome-container') || document.getElementById('welcome-screen');
  if (welcomeContainer && typeof gsap !== 'undefined') {
    if (isReducedMotion()) {
      // Reduced motion: fade container opacity over 0.3s without y axis stagger
      gsap.to('.welcome-container', { duration: 0.3, opacity: 1, overwrite: "auto" });
      const welcomeElements = document.querySelectorAll('.welcome-element');
      welcomeElements.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    } else {
      // 1. Container fade in
      gsap.to('.welcome-container', { duration: 0.2, opacity: 1, overwrite: "auto" });
      // 2. Elements staggered entrance from y: 30
      gsap.from('.welcome-element', {
        duration: 0.8,
        y: 30,
        opacity: 0,
        stagger: 0.1,
        ease: "power3.out",
        overwrite: "auto"
      });
    }
  } else if (welcomeContainer) {
    welcomeContainer.style.opacity = '1';
  }

  // Welcome Screen: CTA Button with autofocus
  const startBtn = document.getElementById('welcome-start-btn');
  if (startBtn) {
    try {
      startBtn.focus();
    } catch (_) {}
    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof gsap !== 'undefined') {
        gsap.to(startBtn, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
      }
      if (isAnimating) return;
      startExperience();
    });
  }

  // Welcome Screen: All Key Badges/Pills are clickable
  const welcomeBadges = document.querySelectorAll('#welcome-screen .key-badge, #welcome-screen .shortcut-pill');
  welcomeBadges.forEach((badge) => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof gsap !== 'undefined') {
        gsap.to(badge, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
      }
      if (isAnimating) return;
      startExperience();
    });
  });

  // Welcome Screen: Clicking anywhere on the overlay also starts experience
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.addEventListener('click', () => {
      if (isAnimating) return;
      startExperience();
    });
  }


  // Bind directly to real DOM elements using IDs, classes, and attributes
  const prevSelectors = '#nav-arrow-prev, .step-controls .step-prev-btn, .step-controls button[data-action="prev"], .nav-arrows-container [data-action="prev"], .nav-btn-prev, .carousel-prev, [data-action="prev"]';
  const nextSelectors = '#nav-arrow-next, .step-controls .step-next-btn, .step-controls button[data-action="next"], .nav-arrows-container [data-action="next"], .nav-btn-next, .carousel-next, [data-action="next"]';

  const prevButtons = document.querySelectorAll(prevSelectors);
  prevButtons.forEach((btn) => {
    btn.style.pointerEvents = 'auto';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyNavRecoil(btn);
      navigatePrev();
    };
  });

  const nextButtons = document.querySelectorAll(nextSelectors);
  nextButtons.forEach((btn) => {
    btn.style.pointerEvents = 'auto';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyNavRecoil(btn);
      navigateNext();
    };
  });

  // Top-Left and Bottom-Right Thumbnail Buttons
  const prevThumbBtn = document.getElementById('prev-btn');
  if (prevThumbBtn) {
    prevThumbBtn.style.pointerEvents = 'auto';
    prevThumbBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyNavRecoil(prevThumbBtn);
      navigatePrev();
    };
  }

  const nextThumbBtn = document.getElementById('next-btn');
  if (nextThumbBtn) {
    nextThumbBtn.style.pointerEvents = 'auto';
    nextThumbBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      applyNavRecoil(nextThumbBtn);
      navigateNext();
    };
  }

  // Click on Center Graphic selects option for Steps 1-4
  const centerWrap = document.getElementById('center-img-wrap');
  if (centerWrap) {
    centerWrap.addEventListener('click', () => {
      if (typeof gsap !== 'undefined') {
        gsap.to(centerWrap, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
      }
      if (isAnimating) return;
      if (activeStep < 5) {
        selectOption(activeStep, activeOption);
      }
    });
  }

  // Global keyboard & touch listeners
  document.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Top Nav Pills
  const navItems = document.querySelectorAll('.nav-pill-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof gsap !== 'undefined') {
        gsap.to(btn, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
      }
      if (isAnimating) return;
      const step = parseInt(btn.dataset.step, 10);
      switchStepDirect(step);
    });
  });

  // Bind the final submit button with physical click recoil and loading state
  let isSubmitting = false;

  async function handleSubmission(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    const btn = document.querySelector('.submit-btn') || document.getElementById('final-submit-btn');
    if (!btn || btn.classList.contains('is-loading') || isSubmitting) return; // Guard against duplicate submissions

    // 1. Play zero-latency Confirm audio
    if (typeof playConfirm === 'function') {
      playConfirm();
    }

    // 2. Add visual recoil class
    btn.classList.add('is-pressed');
    setTimeout(() => {
      btn.classList.remove('is-pressed');
    }, 50);

    // 3. Trigger loading state
    btn.classList.add('is-loading');
    isSubmitting = true;
    btn.style.pointerEvents = "none";
    btn.setAttribute('aria-label', 'Transmitting data...');

    // Synchronize DOM contact input values into formData before submission
    const nameInp = document.getElementById('user-name');
    const orgInp = document.getElementById('user-organization');
    const emailInp = document.getElementById('user-email');
    const phoneInp = document.getElementById('user-phone');
    const webInp = document.getElementById('user-website');
    const notesInp = document.getElementById('user-notes') || document.getElementById('step5-textarea');

    if (!formData.contact) formData.contact = {};
    if (nameInp && nameInp.value.trim()) formData.contact.name = nameInp.value.trim();
    if (orgInp && orgInp.value.trim()) formData.contact.company = orgInp.value.trim();
    if (emailInp && emailInp.value.trim()) formData.contact.email = emailInp.value.trim();
    if (phoneInp && phoneInp.value.trim()) formData.contact.phone = phoneInp.value.trim();
    if (webInp && webInp.value.trim()) formData.contact.website = webInp.value.trim();
    if (notesInp && notesInp.value.trim()) formData.contact.additionalNotes = notesInp.value.trim();

    if (formData.contact) {
      for (const [cKey, cVal] of Object.entries(formData.contact)) {
        if (cVal && !formData[`contact_${cKey}`]) {
          formData[`contact_${cKey}`] = cVal;
        }
      }
    }

    const industryVal = (formData[1] && formData[1].title) || (formSteps[1] && formSteps[1][stepSelections[1] !== null && stepSelections[1] !== undefined ? stepSelections[1] : 0]?.title) || '';
    const sizeVal = (formData[2] && formData[2].title) || (formSteps[2] && formSteps[2][stepSelections[2] !== null && stepSelections[2] !== undefined ? stepSelections[2] : 0]?.title) || '';
    const revenueVal = (formData[3] && formData[3].title) || (formSteps[3] && formSteps[3][stepSelections[3] !== null && stepSelections[3] !== undefined ? stepSelections[3] : 0]?.title) || '';
    const bottleneckVal = (formData[4] && formData[4].title) || (formSteps[4] && formSteps[4][stepSelections[4] !== null && stepSelections[4] !== undefined ? stepSelections[4] : 0]?.title) || '';

    const nameVal = (formData.contact && formData.contact.name) || formData.contact_name || (nameInp ? nameInp.value.trim() : '');
    const companyVal = (formData.contact && formData.contact.company) || formData.contact_company || (orgInp ? orgInp.value.trim() : '');
    const emailVal = (formData.contact && formData.contact.email) || formData.contact_email || (emailInp ? emailInp.value.trim() : '');
    const phoneVal = (formData.contact && formData.contact.phone) || formData.contact_phone || (phoneInp ? phoneInp.value.trim() : '');
    const websiteVal = (formData.contact && formData.contact.website) || formData.contact_website || (webInp ? webInp.value.trim() : '');
    const notesVal = (formData.contact && formData.contact.additionalNotes) || formData.contact_additionalNotes || (notesInp ? notesInp.value.trim() : '');

    const formDataObject = {
      industry: industryVal,
      companySize: sizeVal,
      annualRevenue: revenueVal,
      bottlenecks: bottleneckVal ? [bottleneckVal] : [],
      fullName: nameVal,
      email: emailVal,
      phone: phoneVal,
      companyName: companyVal,
      website: websiteVal,
      additionalNotes: notesVal
    };

    // State 2: Collapse Animation
    const prefersReduced = isReducedMotion();
    const runCollapseSequence = () => {
      return new Promise((resolve) => {
        if (prefersReduced) {
          const pills = document.querySelectorAll('.data-pill');
          pills.forEach((p) => {
            p.style.opacity = '0';
            p.style.display = 'none';
          });
          const titles = document.querySelector('.review-titles');
          if (titles) {
            titles.style.opacity = '0';
            titles.style.display = 'none';
          }
          resolve();
        } else {
          const tl = gsap.timeline({
            onComplete: () => {
              resolve();
            }
          });

          // 1. Collapse pills into submit button
          tl.to('.data-pill', {
            duration: 0.6,
            scale: 0,
            opacity: 0,
            y: 50,
            stagger: 0.05,
            ease: "power3.in"
          });

          // 2. Simultaneously fade out the Title block
          tl.to('.review-titles', {
            duration: 0.4,
            opacity: 0
          }, 0);
        }
      });
    };

    const collapsePromise = runCollapseSequence();

    // Transmit collected payload to n8n webhook via submitFormToWebhook
    const submissionResult = await submitFormToWebhook(formDataObject);

    if (submissionResult.success) {
      // Ensure collapse animation completed
      await collapsePromise;
      await new Promise((r) => setTimeout(r, 200));

      // Audio feedback on completion
      if (typeof playConfirm === 'function') {
        playConfirm();
      }

      // Hide the submit button smoothly
      if (typeof gsap !== 'undefined' && !prefersReduced) {
        gsap.to(btn, {
          opacity: 0,
          scale: 0.85,
          duration: 0.25,
          onComplete: () => {
            btn.style.display = 'none';
          }
        });
      } else {
        btn.style.display = 'none';
        btn.style.opacity = '0';
      }

      // Extract and safely populate dynamic personalized values
      let firstName = 'Partner';
      if (nameVal && typeof nameVal === 'string' && nameVal.trim()) {
        const parts = nameVal.trim().split(/\s+/);
        if (parts.length > 0 && parts[0]) {
          firstName = parts[0];
        }
      }

      const cleanIndustry = (industryVal && industryVal !== 'NOT PROVIDED') ? industryVal : 'high-growth';
      const cleanCompany = (companyVal && companyVal.trim()) ? companyVal.trim() : 'your company';
      const cleanBottleneck = (bottleneckVal && bottleneckVal.trim()) ? bottleneckVal.trim() : 'operational bottlenecks';
      const cleanEmail = (emailVal && emailVal.trim()) ? emailVal.trim() : 'your inbox';

      // Safe XSS-proof DOM text assignment
      const fnEl = document.getElementById('confirm-user-firstname');
      if (fnEl) fnEl.textContent = firstName;

      const indEl = document.getElementById('confirm-user-industry');
      if (indEl) indEl.textContent = cleanIndustry;

      const compEl = document.getElementById('confirm-user-company');
      if (compEl) compEl.textContent = cleanCompany;

      const botEl = document.getElementById('confirm-user-bottleneck');
      if (botEl) botEl.textContent = cleanBottleneck;

      const emEl = document.getElementById('confirm-user-email');
      if (emEl) emEl.textContent = cleanEmail;

      const tIndEl = document.getElementById('tracker-industry');
      if (tIndEl) tIndEl.textContent = cleanIndustry;

      const tEmEl = document.getElementById('tracker-email');
      if (tEmEl) tEmEl.textContent = cleanEmail;

      // Show confirmation card with staggered GSAP entrance
      const confirmCard = document.getElementById('confirmation-card');
      if (confirmCard) {
        confirmCard.style.display = 'flex';
        confirmCard.style.pointerEvents = 'auto';

        if (prefersReduced || typeof gsap === 'undefined') {
          confirmCard.style.opacity = '1';
          const items = confirmCard.querySelectorAll('.confirm-badge, .confirm-headline, .confirm-subcopy, .tracker-item, .confirm-reassurance, .reset-inquiry-btn');
          items.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
        } else {
          const tl = gsap.timeline();

          // 1. Confirmation Card entrance
          tl.fromTo(confirmCard,
            { opacity: 0, y: 30, scale: 0.96 },
            { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" }
          );

          // 2. Badge, Headline, and Sub-Copy stagger
          tl.fromTo(['.confirm-badge', '.confirm-headline', '.confirm-subcopy'],
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.45, stagger: 0.12, ease: "power2.out" },
            "-=0.3"
          );

          // 3. 3-Step Live Care Tracker staggered sequentially 0.4s apart
          tl.fromTo('.tracker-item',
            { opacity: 0, x: -16 },
            { opacity: 1, x: 0, duration: 0.5, stagger: 0.4, ease: "back.out(1.4)" },
            "-=0.1"
          );

          // 4. Reassurance note and reset button
          tl.fromTo(['.confirm-reassurance', '.reset-inquiry-btn'],
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.4, stagger: 0.1, ease: "power2.out" },
            "-=0.2"
          );
        }
      }
    } else {
      await collapsePromise;

      btn.classList.remove('is-loading', 'is-pressed', 'loading', 'success');
      btn.style.width = '';
      btn.style.height = '';
      btn.style.padding = '';
      btn.innerHTML = '<span class="btn-text">RETRY SUBMISSION</span>';
      btn.style.pointerEvents = "auto";
      isSubmitting = false;

      // Restore review screen pills and titles
      if (!prefersReduced && typeof gsap !== 'undefined') {
        gsap.to(['.data-pill', '.review-titles'], {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.02,
          clearProps: "transform,opacity"
        });
      } else {
        const pills = document.querySelectorAll('.data-pill');
        pills.forEach((p) => {
          p.style.opacity = '1';
          p.style.display = 'flex';
        });
        const titles = document.querySelector('.review-titles');
        if (titles) {
          titles.style.opacity = '1';
          titles.style.display = 'flex';
        }
      }

      // Actionable, clear guidance for n8n webhooks
      const errMsg = submissionResult.error || "Unknown error";
      const is404 = errMsg.includes('404');
      const alertMsg = is404
        ? "⚠️ n8n Webhook Not Listening (HTTP 404: Not Found)\n\n" +
          "Your n8n test webhook is not active yet.\n\n" +
          "How to fix in n8n:\n" +
          "1. In n8n, open your Webhook node and click 'Listen for test event' (or 'Test step').\n" +
          "2. Return here and click 'RETRY SUBMISSION'.\n\n" +
          "(Tip: You can also toggle the workflow to 'Active' at the top-right in n8n to accept submissions permanently)."
        : `Submission Failed:\n\n${errMsg}\n\nPlease check that n8n is running at http://localhost:5678 and retry.`;

      // Defer alert slightly so Chrome repaints the restored pills and RETRY button
      setTimeout(() => {
        alert(alertMsg);
      }, 50);
    }
  }

  window.handleSubmission = handleSubmission;

  // Bind to physical click
  const submitBtn = document.querySelector('.submit-btn') || document.getElementById('final-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmission);
  }

  // Reset function to transition back to Step 01 cleanly without reload
  function resetFormInquiry() {
    if (typeof playCancel === 'function') {
      playCancel();
    } else if (typeof playTick === 'function') {
      playTick();
    }

    const confirmCard = document.getElementById('confirmation-card');
    const reviewScreen = document.getElementById('final-review-screen');
    const submitBtn = document.getElementById('final-submit-btn') || document.querySelector('.submit-btn');

    // 1. Hide confirmation card
    if (confirmCard) {
      if (typeof gsap !== 'undefined' && !isReducedMotion()) {
        gsap.to(confirmCard, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          onComplete: () => {
            confirmCard.style.display = 'none';
          }
        });
      } else {
        confirmCard.style.display = 'none';
        confirmCard.style.opacity = '0';
      }
    }

    // 2. Hide review screen
    if (reviewScreen) {
      if (typeof gsap !== 'undefined' && !isReducedMotion()) {
        gsap.to(reviewScreen, {
          opacity: 0,
          duration: 0.35,
          onComplete: () => {
            reviewScreen.style.display = 'none';
          }
        });
      } else {
        reviewScreen.style.display = 'none';
        reviewScreen.style.opacity = '0';
      }
    }

    // 3. Restore main stage elements
    const grid = document.getElementById('content-grid');
    if (grid) {
      grid.style.display = '';
      if (typeof gsap !== 'undefined') gsap.to(grid, { opacity: 1, duration: 0.4, delay: 0.1 });
      else grid.style.opacity = '1';
    }
    const prev = document.getElementById('prev-slot-wrap');
    if (prev) {
      prev.style.display = '';
      if (typeof gsap !== 'undefined') gsap.to(prev, { opacity: 1, duration: 0.4, delay: 0.1 });
      else prev.style.opacity = '1';
    }
    const next = document.getElementById('next-slot-wrap');
    if (next) {
      next.style.display = '';
      if (typeof gsap !== 'undefined') gsap.to(next, { opacity: 1, duration: 0.4, delay: 0.1 });
      else next.style.opacity = '1';
    }
    const hdr = document.querySelector('header');
    if (hdr) {
      hdr.style.display = '';
      if (typeof gsap !== 'undefined') gsap.to(hdr, { opacity: 1, duration: 0.4, delay: 0.1 });
      else hdr.style.opacity = '1';
    }

    // 4. Reset form selections and state
    stepSelections = { 1: 0, 2: 0, 3: 0, 4: 0 };
    formData = {
      1: formSteps[1] ? formSteps[1][0] : null,
      contact: {}
    };

    const contactForm = document.getElementById('contact-autofill-form');
    if (contactForm) {
      contactForm.reset();
      const allInputs = contactForm.querySelectorAll('input, textarea');
      allInputs.forEach(inp => {
        inp.value = '';
        inp.classList.remove('invalid');
        inp.style.borderBottom = '';
        inp.style.color = '';
      });
      const errorEl = document.getElementById('input-error-message');
      if (errorEl) {
        errorEl.classList.remove('visible');
        errorEl.textContent = '';
      }
    }

    // 5. Restore submit button and review titles ready for next submission
    if (submitBtn) {
      submitBtn.className = 'btn-primary submit-btn';
      submitBtn.classList.remove('is-loading', 'is-pressed', 'loading', 'success');
      submitBtn.style.display = '';
      submitBtn.style.opacity = '1';
      submitBtn.style.pointerEvents = 'auto';
      submitBtn.innerHTML = '<span class="btn-text">CONFIRM &amp; SUBMIT</span>';
      submitBtn.setAttribute('aria-label', 'Confirm and submit selections');
    }

    const titles = document.querySelector('.review-titles');
    if (titles) {
      titles.style.display = 'flex';
      titles.style.opacity = '1';
      if (typeof gsap !== 'undefined') gsap.set(titles, { clearProps: "all" });
    }

    // 6. Transition to Step 01
    activeStep = 1;
    activeOption = 0;
    isSubmitting = false;
    renderSlots(activeStep, activeOption);
  }

  window.resetFormInquiry = resetFormInquiry;

  // Bind reset button
  const resetBtn = document.getElementById('reset-inquiry-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetFormInquiry);
  }

  // Step 5 W3C Contact Autofill Form synchronization & real-time input handlers
  const contactForm = document.getElementById('contact-autofill-form');
  if (contactForm) {
    const handleAutofillSync = () => {
      const nameInp = document.getElementById('user-name');
      const orgInp = document.getElementById('user-organization');
      const emailInp = document.getElementById('user-email');
      const phoneInp = document.getElementById('user-phone');
      const webInp = document.getElementById('user-website');
      const notesInp = document.getElementById('user-notes');

      if (nameInp && nameInp.value) {
        formData.contact.name = nameInp.value.trim();
        formData.contact_name = nameInp.value.trim();
      }
      if (orgInp && orgInp.value) {
        formData.contact.company = orgInp.value.trim();
        formData.contact_company = orgInp.value.trim();
      }
      if (emailInp && emailInp.value) {
        formData.contact.email = emailInp.value.trim();
        formData.contact_email = emailInp.value.trim();
      }
      if (phoneInp && phoneInp.value) {
        const formatted = formatPhoneNumber(phoneInp.value);
        phoneInp.value = formatted;
        formData.contact.phone = formatted;
        formData.contact_phone = formatted;
      }
      if (webInp && webInp.value) {
        formData.contact.website = webInp.value.trim();
        formData.contact_website = webInp.value.trim();
      }
      if (notesInp && notesInp.value) {
        formData.contact.additionalNotes = notesInp.value.trim();
        formData.contact_additionalNotes = notesInp.value.trim();
      }
    };

    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const reviewScreen = document.getElementById('final-review-screen');
      const isReviewActive = reviewScreen && (reviewScreen.style.display === 'flex' || reviewScreen.style.display === 'block' || window.getComputedStyle(reviewScreen).display !== 'none');
      if (isReviewActive && typeof handleSubmission === 'function') {
        handleSubmission(e);
      }
    });

    contactForm.addEventListener('input', handleAutofillSync);
    contactForm.addEventListener('change', handleAutofillSync);

    const allInputs = contactForm.querySelectorAll('input, textarea');
    allInputs.forEach(inp => {
      const clearError = () => {
        inp.classList.remove('invalid');
        inp.style.borderBottom = '';
        inp.style.color = '';
        const errorEl = document.getElementById('input-error-message');
        if (errorEl) {
          errorEl.classList.remove('visible');
          errorEl.textContent = '';
        }
      };
      inp.addEventListener('input', clearError);
      inp.addEventListener('focus', clearError);
      inp.addEventListener('blur', () => {
        if (inp.value.trim() !== '' || activeOption === 0 || activeOption === 1) {
          validateStep5CurrentOption(false);
        }
      });
    });

    const phoneInp = document.getElementById('user-phone');
    if (phoneInp) {
      phoneInp.addEventListener('input', () => {
        phoneInp.value = formatPhoneNumber(phoneInp.value);
      });
      phoneInp.addEventListener('change', () => {
        phoneInp.value = formatPhoneNumber(phoneInp.value);
      });
    }

    const launchBtn = document.getElementById('launch-analysis-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        if (typeof gsap !== 'undefined') {
          gsap.to(launchBtn, { scale: 0.95, duration: 0.05, overwrite: "auto", yoyo: true, repeat: 1 });
        }
        if (isAnimating) return;
        triggerFinalReview();
      });
    }
  }
}

// Guarantee execution regardless of whether readyState is loading, interactive, or complete
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Unified Global Keyboard Navigation & Action Listener
document.addEventListener('keydown', (e) => {
  // Prevent the "machine-gun" glitch for ALL keys if held down
  if (e.repeat) return; 
  
  const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
  
  if (navKeys.includes(e.key)) {
    if (typeof playTick === 'function') playTick();
  } else if (e.key === 'Enter') {
    const reviewScreen = document.getElementById('final-review-screen');
    const isReviewActive = reviewScreen && (reviewScreen.style.display === 'flex' || reviewScreen.style.display === 'block' || window.getComputedStyle(reviewScreen).display !== 'none');
    
    if (isReviewActive && typeof handleSubmission === 'function') {
      handleSubmission();
    } else {
      if (typeof playConfirm === 'function') playConfirm();
    }
  } else if (e.key === 'Backspace') {
    if (typeof playCancel === 'function') playCancel();
  }
});

// Bulletproof Document-Level Event Delegation (Capture Phase) for Step Navigation Buttons
document.addEventListener('click', (e) => {
  const prevTarget = e.target.closest('#nav-arrow-prev, .step-prev-btn, .carousel-prev, [data-action="prev"]');
  if (prevTarget) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof gsap !== 'undefined') {
      gsap.to(prevTarget, { scale: 0.92, duration: 0.05, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto" });
    }
    prevTarget.classList.add('is-pressed');
    setTimeout(() => { prevTarget.classList.remove('is-pressed'); }, 50);
    navigatePrev();
    return;
  }
  const nextTarget = e.target.closest('#nav-arrow-next, .step-next-btn, .carousel-next, [data-action="next"]');
  if (nextTarget) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof gsap !== 'undefined') {
      gsap.to(nextTarget, { scale: 0.92, duration: 0.05, ease: "power2.out", yoyo: true, repeat: 1, overwrite: "auto" });
    }
    nextTarget.classList.add('is-pressed');
    setTimeout(() => { nextTarget.classList.remove('is-pressed'); }, 50);
    navigateNext();
    return;
  }
}, true);
