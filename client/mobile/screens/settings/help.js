function tr(key, fallback, vars) {
    const value = window.i18n?.t(key, vars);
    if (value && value !== key) return value;
    return fallback;
}

function toggleFaq(el) {
    el.classList.toggle('open');
}

function contactSupport() {
    window.location.href = '../chats/chats.html?chat=craneapp_bot';
}

function openCraneAppBotChat() {
    window.location.href = '../chats/chats.html?chat=craneapp_bot';
}

function openModal(title, content) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('docModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('docModal').classList.remove('active');
    document.body.style.overflow = '';
}

function showDocs() {
    openModal(tr('docsModalTitle', '📖 CraneApp documentation'), `
        <div style="line-height:1.6;">
            <h3>${tr('docsWelcomeTitle', 'Welcome to CraneApp!')}</h3>
            <p>${tr('docsWelcomeText', 'CraneApp is a modern messenger focused on speed, security, and ease of use.')}</p>
            <h4>${tr('docsMainFeatures', 'Main features:')}</h4>
            <ul style="margin:10px 0; padding-left:20px;">
                <li>${tr('docsFeatureChats', 'Chats and groups for conversations and communities')}</li>
                <li>${tr('docsFeatureChannels', 'Channels for following interesting updates')}</li>
                <li>${tr('docsFeatureCalls', 'Free voice and video calls over the internet')}</li>
                <li>${tr('docsFeatureFiles', 'Photo, video, document, and file sharing')}</li>
                <li>${tr('docsFeatureBot', 'CraneApp Bot for official notifications')}</li>
            </ul>
            <p style="margin-top:20px; color:#888;">${tr('appVersionLine', 'Version 1.0.0 | 2026 CraneApp')}</p>
        </div>
    `);
}

function showPrivacy() {
    openModal(tr('privacyModalTitle', '🔒 Privacy policy'), `
        <div style="line-height:1.6;">
            <h3>${tr('privacyModalHeading', 'CraneApp privacy policy')}</h3>
            <p>${tr('privacyUpdated', 'Last updated: April 23, 2026')}</p>
            <h4>${tr('privacyDataTitle', '1. Data we collect')}</h4>
            <p>${tr('privacyDataText', 'We collect only the minimum data needed to run the app.')}</p>
            <h4>${tr('privacyUseTitle', '2. How we use data')}</h4>
            <p>${tr('privacyUseText', 'Your data is used for messenger operation, account security, and technical support.')}</p>
            <h4>${tr('privacyProtectionTitle', '3. Data protection')}</h4>
            <p>${tr('privacyProtectionText', 'We use encryption to protect your messages and store data on protected servers.')}</p>
            <h4>${tr('privacyDeleteTitle', '4. Data deletion')}</h4>
            <p>${tr('privacyDeleteText', 'You can delete your account at any time through settings.')}</p>
            <p style="margin-top:20px; color:#888;">2026 CraneApp Team</p>
        </div>
    `);
}

function showTerms() {
    openModal(tr('termsModalTitle', '📜 Terms of use'), `
        <div style="line-height:1.6;">
            <h3>${tr('termsModalHeading', 'CraneApp terms of use')}</h3>
            <p>${tr('termsEffective', 'Effective from: April 23, 2026')}</p>
            <h4>${tr('termsAcceptanceTitle', '1. Acceptance')}</h4>
            <p>${tr('termsAcceptanceText', 'By using CraneApp, you agree to these terms.')}</p>
            <h4>${tr('termsRulesTitle', '2. Rules of conduct')}</h4>
            <p>${tr('termsRulesText', 'Spam, malware distribution, harassment, illegal activity, and bypassing blocks are prohibited.')}</p>
            <h4>${tr('termsAccountsTitle', '3. Accounts')}</h4>
            <p>${tr('termsAccountsText', 'You are responsible for your account security. Do not share your password with third parties.')}</p>
            <h4>${tr('termsTerminationTitle', '4. Termination')}</h4>
            <p>${tr('termsTerminationText', 'We may block accounts that violate the rules.')}</p>
            <h4>${tr('termsLiabilityTitle', '5. Limitation of liability')}</h4>
            <p>${tr('termsLiabilityText', 'CraneApp is provided as is. We are not responsible for data loss.')}</p>
            <p style="margin-top:20px; color:#888;">2026 CraneApp Team</p>
        </div>
    `);
}

document.getElementById('docModal').addEventListener('click', function(e) {
    if (e.target.id === 'docModal') closeModal();
});

if (window.i18n) window.i18n.translatePage();
