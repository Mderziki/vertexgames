/* Vertex Games — page control for chat (scroll, proposal form) */

function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbx34g2_7KSsIV5Pgt4ZqGl9KxR1vU26V3-cXgffEpRggMP_5BnaXrrOWPMqX86mloHA/exec';

const PAGE_SECTIONS = {
  top: 'hero',
  hero: 'hero',
  home: 'hero',
  services: 'services',
  service: 'services',
  tech: 'tech',
  technology: 'tech',
  engines: 'tech',
  publish: 'publish',
  publishing: 'publish',
  stores: 'publish',
  portfolio: 'portfolio',
  work: 'portfolio',
  showcase: 'portfolio',
  contact: 'contact',
  process: 'services',
};

const PROJECT_OPTIONS = [
  '2D Game',
  '3D Game',
  'VR/AR Experience',
  'Prototype / MVP',
  'Full-Cycle Development',
  'Other',
];

let proposalStatusApi = null;

function normalizeProjectType(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const exact = PROJECT_OPTIONS.find((o) => o.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const lower = raw.toLowerCase();
  if (/^2d|two.?d/.test(lower)) return '2D Game';
  if (/^3d|three.?d/.test(lower)) return '3D Game';
  if (/vr|ar|virtual reality|augmented|xr|immersive/.test(lower)) return 'VR/AR Experience';
  if (/mvp|prototype|proof of concept/.test(lower)) return 'Prototype / MVP';
  if (/full.?cycle|end.?to.?end|complete/.test(lower)) return 'Full-Cycle Development';
  return 'Other';
}

function scrollToPageSection(target) {
  const key = (target || '').toString().toLowerCase().trim();
  const id = PAGE_SECTIONS[key] || key;
  const el = document.getElementById(id);
  if (!el) return false;

  const navOffset = 80;
  const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  return true;
}

function pulsePageFocus(el) {
  if (!el) return;
  el.classList.remove('is-page-focus');
  void el.offsetWidth;
  el.classList.add('is-page-focus');
  window.setTimeout(() => el.classList.remove('is-page-focus'), 2200);
}

function focusProposalField(fieldId) {
  const form = document.getElementById('proposal-form');
  const contact = document.getElementById('contact');
  if (!form) return false;

  pulsePageFocus(contact);
  pulsePageFocus(form);

  const order = ['FullName', 'Email', 'Project', 'project-description'];
  const pick =
    fieldId && document.getElementById(fieldId)
      ? fieldId
      : order.find((id) => {
          const input = document.getElementById(id);
          return input && !String(input.value || '').trim();
        }) || 'FullName';

  const input = document.getElementById(pick);
  if (input) {
    input.focus({ preventScroll: true });
    if (input.select && input.tagName !== 'SELECT') input.select();
  }
  return true;
}

function fillProposalForm(data) {
  if (!data || typeof data !== 'object') return false;
  const form = document.getElementById('proposal-form');
  if (!form) return false;

  if (data.FullName != null) {
    const el = document.getElementById('FullName');
    if (el) el.value = String(data.FullName).trim();
  }
  if (data.Email != null) {
    const el = document.getElementById('Email');
    if (el) el.value = String(data.Email).trim();
  }
  if (data.Project != null) {
    const el = document.getElementById('Project');
    if (el) el.value = normalizeProjectType(data.Project);
  }
  if (data.Description != null) {
    const el = document.getElementById('project-description');
    if (el) el.value = String(data.Description).trim();
  }

  scrollToPageSection('contact');
  focusProposalField();
  return true;
}

function readProposalFields() {
  return {
    FullName: document.getElementById('FullName')?.value.trim() || '',
    Email: document.getElementById('Email')?.value.trim() || '',
    Project: document.getElementById('Project')?.value.trim() || '',
    Description: document.getElementById('project-description')?.value.trim() || '',
  };
}

function validateProposalFields(fields) {
  if (!fields.FullName) return 'Full name is required.';
  if (!fields.Email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.Email)) return 'Please enter a valid email.';
  if (!fields.Project) return 'Please select a project type.';
  if (!fields.Description) return 'Project details are required.';
  return null;
}

function submitToGoogleSheets(fields) {
  return new Promise((resolve, reject) => {
    const iframeName = 'gas_frame_' + Date.now();
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.title = 'Form submission';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';

    const hiddenForm = document.createElement('form');
    hiddenForm.method = 'POST';
    hiddenForm.action = GOOGLE_SCRIPT_URL;
    hiddenForm.target = iframeName;
    hiddenForm.acceptCharset = 'UTF-8';
    hiddenForm.style.display = 'none';

    Object.keys(fields).forEach((key) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = fields[key];
      hiddenForm.appendChild(input);
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out. Redeploy Apps Script and try again.'));
    }, 25000);

    function cleanup() {
      clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      if (hiddenForm.parentNode) hiddenForm.parentNode.removeChild(hiddenForm);
    }

    function onMessage(event) {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.result === undefined) return;
      cleanup();
      resolve(data);
    }

    window.addEventListener('message', onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(hiddenForm);
    hiddenForm.submit();
  });
}

function submitProposal(fields, options) {
  const opts = options || {};
  const form = document.getElementById('proposal-form');
  const submitBtn = document.getElementById('submit-btn');
  const statusApi = proposalStatusApi;

  if (!form || !submitBtn) {
    return Promise.reject(new Error('Proposal form not found on this page.'));
  }

  if (GOOGLE_SCRIPT_URL.includes('PASTE_YOUR')) {
    const err = new Error('Add your Google Apps Script /exec URL in vertex-page.js.');
    if (statusApi) statusApi.showStatus('error', err.message);
    return Promise.reject(err);
  }

  const payload = {
    FullName: String(fields.FullName || '').trim(),
    Email: String(fields.Email || '').trim(),
    Project: normalizeProjectType(fields.Project),
    Description: String(fields.Description || '').trim(),
  };

  const validationError = validateProposalFields(payload);
  if (validationError) {
    if (statusApi) statusApi.showStatus('error', validationError);
    return Promise.reject(new Error(validationError));
  }

  if (opts.fillForm !== false) fillProposalForm(payload);

  if (statusApi) statusApi.hideStatus();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  return submitToGoogleSheets(payload)
    .then((data) => {
      if (data && data.result === 'success') {
        const firstName = payload.FullName.split(' ')[0];
        const message =
          'Thanks, ' + firstName + '! Your project inquiry was sent. We will contact you soon.';
        if (statusApi) statusApi.showStatus('success', message);
        form.reset();
        document.dispatchEvent(
          new CustomEvent('vertex:proposal-submitted', {
            detail: { success: true, fields: payload, source: opts.source || 'form' },
          })
        );
        return data;
      }
      const errMsg = (data && data.error) || 'Failed to send. Please try again.';
      if (statusApi) statusApi.showStatus('error', errMsg);
      document.dispatchEvent(
        new CustomEvent('vertex:proposal-submitted', {
          detail: { success: false, error: errMsg, fields: payload, source: opts.source || 'form' },
        })
      );
      throw new Error(errMsg);
    })
    .catch((err) => {
      if (statusApi && err.message) statusApi.showStatus('error', err.message);
      throw err;
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Project Inquiry';
    });
}

function initPageControl() {
  window.VertexPage = {
    scrollTo: scrollToPageSection,
    focusProposal: focusProposalField,
    fillProposal: fillProposalForm,
    readProposal: readProposalFields,
    submitProposal,
    sections: Object.keys(PAGE_SECTIONS),
    projectOptions: PROJECT_OPTIONS.slice(),
  };
}

function initProposalForm() {
  const form = document.getElementById('proposal-form');
  const submitBtn = document.getElementById('submit-btn');
  const statusEl = document.getElementById('status-message');
  if (!form || !submitBtn || !statusEl) return;

  function showStatus(type, message) {
    statusEl.textContent = message;
    statusEl.className = 'status-message visible ' + type;
  }

  function hideStatus() {
    statusEl.className = 'status-message';
    statusEl.textContent = '';
  }

  proposalStatusApi = { showStatus, hideStatus };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitProposal(readProposalFields(), { fillForm: false, source: 'form' }).catch(() => {});
  });
}

onReady(() => {
  initPageControl();
  initProposalForm();
});
