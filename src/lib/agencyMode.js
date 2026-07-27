const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_CREATIVE_STUDIO_TABS = ['image', 'marketing'];

function envValue(name) {
    return (process.env[name] || '').trim();
}

export function isAgencyModeEnabled() {
    return TRUE_VALUES.has(envValue('AGENCY_MODE').toLowerCase());
}

export function getCreativeStudioTabs() {
    const configured = envValue('CREATIVE_STUDIO_TABS')
        .split(',')
        .map((tab) => tab.trim())
        .filter(Boolean);

    return configured.length > 0 ? configured : DEFAULT_CREATIVE_STUDIO_TABS;
}

export function getAgencyShellConfig() {
    return {
        agencyMode: isAgencyModeEnabled(),
        allowedTabIds: getCreativeStudioTabs(),
    };
}

export function getMuApiBaseUrl() {
    return envValue('MUAPI_BASE_URL') || 'https://api.muapi.ai';
}

export function getServerMuApiKey() {
    return envValue('MUAPI_API_KEY');
}
