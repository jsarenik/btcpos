import * as lwk from "lwk_wasm"
import {
    setWollet, setCurrencyCode, getCurrencyCode,
    setPricesFetcher, getPricesFetcher,
    setExchangeRate, getExchangeRate,
    setWasmReady, isWasmReady,
    subscribe
} from './state'

// Constants
const SATOSHIS_PER_BTC: number = 100_000_000;
const RATE_UPDATE_INTERVAL_MS: number = 60_000; // 1 minute
const LOCALSTORAGE_FORM_KEY: string = 'btcpos_setup_form';

// Network configuration (hardcoded to mainnet)
const network: lwk.Network = lwk.Network.mainnet();

// Reference to main app container
const app: HTMLElement = document.getElementById('app')!;

// Rate update interval handle
let rateUpdateInterval: number | null = null;

// =============================================================================
// URL-safe Base64 Encoding/Decoding
// =============================================================================

function base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
    // Add padding back
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    return atob(base64);
}

// =============================================================================
// Configuration Encoding/Decoding
// =============================================================================

interface POSConfig {
    d: string; // descriptor
    c: string; // currency code (alpha3)
}

function encodeConfig(descriptor: string, currency: string): string {
    const config: POSConfig = { d: descriptor, c: currency };
    return base64UrlEncode(JSON.stringify(config));
}

function decodeConfig(encoded: string): POSConfig | null {
    try {
        const json = base64UrlDecode(encoded);
        const config = JSON.parse(json) as POSConfig;
        if (typeof config.d !== 'string' || typeof config.c !== 'string') {
            return null;
        }
        return config;
    } catch {
        return null;
    }
}

// =============================================================================
// LocalStorage helpers
// =============================================================================

function saveFormToLocalStorage(descriptor: string, currency: string): void {
    try {
        localStorage.setItem(LOCALSTORAGE_FORM_KEY, JSON.stringify({ descriptor, currency }));
    } catch {
        // Ignore storage errors
    }
}

function loadFormFromLocalStorage(): { descriptor: string; currency: string } | null {
    try {
        const data = localStorage.getItem(LOCALSTORAGE_FORM_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch {
        // Ignore storage errors
    }
    return null;
}

// =============================================================================
// Template Rendering
// =============================================================================

function renderTemplate(templateId: string): void {
    const template = document.getElementById(templateId) as HTMLTemplateElement;
    if (!template) {
        console.error(`Template ${templateId} not found`);
        return;
    }
    app.innerHTML = '';
    app.appendChild(template.content.cloneNode(true));
}

// =============================================================================
// Exchange Rate Fetching
// =============================================================================

async function fetchExchangeRate(): Promise<void> {
    const currencyCode = getCurrencyCode();
    const pricesFetcher = getPricesFetcher();

    if (!currencyCode || !pricesFetcher) {
        return;
    }

    try {
        const rates = await pricesFetcher.rates(currencyCode);
        const median = rates.median();
        setExchangeRate(median);

        // Update UI
        const rateValue = document.getElementById('rate-value');
        if (rateValue) {
            rateValue.textContent = median.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        }
    } catch (e) {
        console.error('Failed to fetch exchange rate:', e);
    }
}

function startRateUpdates(): void {
    // Fetch immediately
    fetchExchangeRate();

    // Then fetch every minute
    if (rateUpdateInterval) {
        clearInterval(rateUpdateInterval);
    }
    rateUpdateInterval = window.setInterval(fetchExchangeRate, RATE_UPDATE_INTERVAL_MS);
}

function stopRateUpdates(): void {
    if (rateUpdateInterval) {
        clearInterval(rateUpdateInterval);
        rateUpdateInterval = null;
    }
}

// =============================================================================
// Fiat to Satoshi Conversion
// =============================================================================

function fiatToSatoshis(fiatAmount: number): number {
    const rate = getExchangeRate();
    if (!rate || rate <= 0) {
        return 0;
    }

    const btcAmount = fiatAmount / rate;
    return Math.round(btcAmount * SATOSHIS_PER_BTC);
}

// =============================================================================
// Setup Page
// =============================================================================

function initSetupPage(): void {
    renderTemplate('setup-page-template');

    const form = document.getElementById('setup-form') as HTMLFormElement;
    const descriptorInput = document.getElementById('descriptor') as HTMLTextAreaElement;
    const currencySelect = document.getElementById('currency') as HTMLSelectElement;
    const generateButton = document.getElementById('generate-link') as HTMLButtonElement;
    const messageDiv = document.getElementById('setup-message') as HTMLDivElement;
    const wasmStatus = document.getElementById('wasm-status') as HTMLDivElement;
    const generatedSection = document.getElementById('generated-link-section') as HTMLDivElement;
    const generatedLinkInput = document.getElementById('generated-link') as HTMLInputElement;
    const copyButton = document.getElementById('copy-link') as HTMLButtonElement;
    const qrImage = document.getElementById('qr-image') as HTMLImageElement;
    const openPosLink = document.getElementById('open-pos-link') as HTMLAnchorElement;

    // Load saved form data
    const savedForm = loadFormFromLocalStorage();
    if (savedForm) {
        descriptorInput.value = savedForm.descriptor;
        currencySelect.value = savedForm.currency;
    }

    // Update WASM status
    function updateWasmStatus(ready: boolean): void {
        const indicator = wasmStatus.querySelector('.status-indicator') as HTMLElement;
        const text = wasmStatus.querySelector('.status-text') as HTMLElement;

        if (ready) {
            indicator.classList.remove('loading');
            indicator.classList.add('ready');
            text.textContent = 'WASM loaded';
            generateButton.disabled = false;
        } else {
            indicator.classList.add('loading');
            indicator.classList.remove('ready');
            text.textContent = 'Loading WASM module...';
            generateButton.disabled = true;
        }
    }

    // Subscribe to WASM ready state
    subscribe('wasm-ready', updateWasmStatus);
    updateWasmStatus(isWasmReady());

    // Show message
    function showMessage(text: string, isError: boolean): void {
        messageDiv.textContent = text;
        messageDiv.className = 'message ' + (isError ? 'error' : 'success');
    }

    function clearMessage(): void {
        messageDiv.className = 'message';
        messageDiv.textContent = '';
    }

    // Form submission
    form.addEventListener('submit', async (e: Event) => {
        e.preventDefault();
        clearMessage();

        const descriptor = descriptorInput.value.trim();
        const currency = currencySelect.value;

        if (!descriptor) {
            showMessage('Please enter a CT descriptor', true);
            return;
        }

        // Validate descriptor using LWK
        try {
            generateButton.disabled = true;
            generateButton.textContent = 'Validating...';

            // This will throw if the descriptor is invalid
            const wolletDescriptor = new lwk.WolletDescriptor(descriptor);

            // Check if descriptor matches network
            const isMainnet = wolletDescriptor.isMainnet();
            const networkIsMainnet = network.isMainnet();

            if (isMainnet !== networkIsMainnet) {
                showMessage(
                    `Descriptor is for ${isMainnet ? 'mainnet' : 'testnet'}, but POS is configured for ${networkIsMainnet ? 'mainnet' : 'testnet'}`,
                    true
                );
                generateButton.disabled = false;
                generateButton.textContent = 'Generate POS Link';
                return;
            }

            // Save form data
            saveFormToLocalStorage(descriptor, currency);

            // Generate the link
            const encoded = encodeConfig(descriptor, currency);
            const baseUrl = window.location.origin + window.location.pathname;
            const posLink = `${baseUrl}#${encoded}`;

            // Show the generated link
            generatedLinkInput.value = posLink;
            openPosLink.href = posLink;

            // Generate QR code
            const qrUri = lwk.stringToQr(posLink);
            qrImage.src = qrUri;

            generatedSection.hidden = false;

            showMessage('POS link generated successfully!', false);
        } catch (e) {
            showMessage(`Invalid descriptor: ${e}`, true);
        } finally {
            generateButton.disabled = false;
            generateButton.textContent = 'Generate POS Link';
        }
    });

    // Copy link button
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(generatedLinkInput.value);
            copyButton.textContent = '✓';
            setTimeout(() => {
                copyButton.textContent = '📋';
            }, 2000);
        } catch {
            // Fallback: select the input
            generatedLinkInput.select();
            document.execCommand('copy');
        }
    });
}

// =============================================================================
// POS Page
// =============================================================================

function initPosPage(config: POSConfig): void {
    renderTemplate('pos-page-template');

    // POS state
    let currentAmount: string = '0';
    let inputMode: 'fiat' | 'sats' = 'fiat';
    const currencyAlpha3 = config.c;

    // Get DOM elements
    const amountDisplay = document.getElementById('amount') as HTMLSpanElement;
    const satoshiDisplay = document.getElementById('satoshi-amount') as HTMLSpanElement;
    const currencyCodeDisplay = document.getElementById('currency-code') as HTMLSpanElement;
    const rateCurrencyDisplay = document.getElementById('rate-currency') as HTMLSpanElement;
    const descriptionInput = document.getElementById('description') as HTMLInputElement;
    const submitButton = document.getElementById('submit') as HTMLButtonElement;
    const walletIdDisplay = document.getElementById('wallet-id') as HTMLSpanElement;
    const setupLink = document.getElementById('setup-link') as HTMLAnchorElement;
    const wasmStatus = document.getElementById('wasm-status') as HTMLDivElement;
    const modeFiatButton = document.getElementById('mode-fiat') as HTMLButtonElement;
    const modeSatsButton = document.getElementById('mode-sats') as HTMLButtonElement;
    const primaryDisplay = document.getElementById('primary-display') as HTMLDivElement;
    const secondaryDisplay = document.getElementById('secondary-display') as HTMLDivElement;

    // Set fixed currency
    currencyCodeDisplay.textContent = currencyAlpha3;
    rateCurrencyDisplay.textContent = currencyAlpha3;

    // Setup link to go back
    setupLink.addEventListener('click', (e: Event) => {
        e.preventDefault();
        stopRateUpdates();
        history.pushState(null, '', window.location.pathname);
        initSetupPage();
    });

    // Convert satoshis to fiat
    function satoshisToFiat(satoshis: number): number {
        const rate = getExchangeRate();
        if (!rate || rate <= 0) {
            return 0;
        }
        const btcAmount = satoshis / SATOSHIS_PER_BTC;
        return btcAmount * rate;
    }

    // Update display styling based on mode
    function updateDisplayStyles(): void {
        if (inputMode === 'fiat') {
            primaryDisplay.classList.remove('secondary-mode');
            primaryDisplay.classList.add('primary-mode');
            secondaryDisplay.classList.remove('primary-mode');
            secondaryDisplay.classList.add('secondary-mode');
            modeFiatButton.classList.add('active');
            modeSatsButton.classList.remove('active');
        } else {
            primaryDisplay.classList.add('secondary-mode');
            primaryDisplay.classList.remove('primary-mode');
            secondaryDisplay.classList.add('primary-mode');
            secondaryDisplay.classList.remove('secondary-mode');
            modeFiatButton.classList.remove('active');
            modeSatsButton.classList.add('active');
        }
    }

    // Format display
    function formatDisplay(): void {
        if (currentAmount === '' || currentAmount === '0') {
            amountDisplay.textContent = '0.00';
            satoshiDisplay.textContent = '0';
            return;
        }

        // Remove leading zeros except if it's just "0" or "0."
        if (currentAmount.startsWith('0') && currentAmount.length > 1 && currentAmount[1] !== '.') {
            currentAmount = currentAmount.replace(/^0+/, '');
        }

        const amount = parseFloat(currentAmount);

        if (inputMode === 'fiat') {
            // Input is fiat, calculate sats
            amountDisplay.textContent = currentAmount;
            if (!isNaN(amount) && amount > 0) {
                const satoshis = fiatToSatoshis(amount);
                satoshiDisplay.textContent = satoshis.toLocaleString('en-US');
            } else {
                satoshiDisplay.textContent = '0';
            }
        } else {
            // Input is sats, calculate fiat
            satoshiDisplay.textContent = currentAmount.includes('.')
                ? currentAmount.split('.')[0]
                : currentAmount;
            if (!isNaN(amount) && amount > 0) {
                const satoshis = Math.floor(amount); // Sats are whole numbers
                const fiat = satoshisToFiat(satoshis);
                amountDisplay.textContent = fiat.toFixed(2);
            } else {
                amountDisplay.textContent = '0.00';
            }
        }
    }

    // Handle input
    function handleInput(value: string): void {
        // In sats mode, don't allow decimal points (sats are integers)
        if (inputMode === 'sats' && value === '.') {
            return;
        }

        // Prevent multiple decimal points
        if (value === '.' && currentAmount.includes('.')) {
            return;
        }

        // Limit decimal places based on mode
        if (currentAmount.includes('.')) {
            const decimalPart = currentAmount.split('.')[1];
            const maxDecimals = inputMode === 'fiat' ? 2 : 0;
            if (decimalPart && decimalPart.length >= maxDecimals && value !== '.') {
                return;
            }
        }

        // Limit total length
        if (currentAmount.length >= 12) {
            return;
        }

        if (currentAmount === '0' && value !== '.') {
            currentAmount = value;
        } else {
            currentAmount += value;
        }

        formatDisplay();
    }

    // Handle backspace
    function handleBackspace(): void {
        if (currentAmount.length <= 1) {
            currentAmount = '0';
        } else {
            currentAmount = currentAmount.slice(0, -1);
        }
        formatDisplay();
    }

    // Handle clear
    function handleClear(): void {
        currentAmount = '0';
        formatDisplay();
    }

    // Get final satoshi amount based on current mode
    function getFinalSatoshis(): number {
        const amount = parseFloat(currentAmount);
        if (isNaN(amount) || amount <= 0) {
            return 0;
        }
        if (inputMode === 'fiat') {
            return fiatToSatoshis(amount);
        } else {
            return Math.floor(amount);
        }
    }

    // Get final fiat amount based on current mode
    function getFinalFiat(): number {
        const amount = parseFloat(currentAmount);
        if (isNaN(amount) || amount <= 0) {
            return 0;
        }
        if (inputMode === 'fiat') {
            return amount;
        } else {
            return satoshisToFiat(Math.floor(amount));
        }
    }

    // Handle submit
    function handleSubmit(): void {
        const satoshis = getFinalSatoshis();
        const fiatAmount = getFinalFiat();
        const description = descriptionInput.value.trim();

        if (satoshis <= 0) {
            alert('Please enter a valid amount greater than 0');
            return;
        }

        // Invoice data (will be used for Boltz integration later)
        const invoiceData = {
            fiatAmount: fiatAmount,
            currency: currencyAlpha3,
            satoshis: satoshis,
            description: description || null,
            timestamp: new Date().toISOString()
        };

        console.log('Invoice data:', invoiceData);

        // For now, show confirmation
        alert(`Invoice created!\n${currencyAlpha3}: ${fiatAmount.toFixed(2)}\nSatoshis: ${satoshis.toLocaleString('en-US')}\nDescription: ${description || 'None'}`);

        // Reset
        currentAmount = '0';
        descriptionInput.value = '';
        formatDisplay();
    }

    // Remove trailing zeros from a number string (e.g., "123.40" -> "123.4", "123.00" -> "123")
    function removeTrailingZeros(numStr: string): string {
        if (!numStr.includes('.')) return numStr;
        // Remove trailing zeros after decimal point
        let result = numStr.replace(/\.?0+$/, '');
        // If we removed everything after decimal, result might be empty or just the integer
        return result || '0';
    }

    // Mode toggle handlers
    modeFiatButton.addEventListener('click', () => {
        if (inputMode !== 'fiat') {
            // Convert current sats to fiat
            const satoshis = getFinalSatoshis();
            inputMode = 'fiat';
            if (satoshis > 0) {
                const fiat = satoshisToFiat(satoshis);
                // Remove trailing zeros so user can continue typing
                currentAmount = removeTrailingZeros(fiat.toFixed(2));
            } else {
                currentAmount = '0';
            }
            updateDisplayStyles();
            formatDisplay();
        }
    });

    modeSatsButton.addEventListener('click', () => {
        if (inputMode !== 'sats') {
            // Convert current fiat to sats
            const satoshis = getFinalSatoshis();
            inputMode = 'sats';
            currentAmount = satoshis > 0 ? satoshis.toString() : '0';
            updateDisplayStyles();
            formatDisplay();
        }
    });

    // Keypad event listeners
    document.querySelectorAll('.key[data-value]').forEach((button: Element) => {
        button.addEventListener('click', () => {
            handleInput((button as HTMLButtonElement).dataset.value!);
        });
    });

    document.getElementById('backspace')!.addEventListener('click', handleBackspace);
    document.getElementById('clear')!.addEventListener('click', handleClear);
    submitButton.addEventListener('click', handleSubmit);

    // Keyboard input
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.target === descriptionInput) {
            return;
        }

        if (e.key >= '0' && e.key <= '9') {
            handleInput(e.key);
        } else if (e.key === '.') {
            handleInput('.');
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            handleBackspace();
        } else if (e.key === 'Escape') {
            handleClear();
        } else if (e.key === 'Enter') {
            handleSubmit();
        }
    });

    // Initialize async parts (wallet and exchange rate)
    async function initWalletAsync(): Promise<void> {
        try {
            // Create wallet descriptor and wallet
            const wolletDescriptor = new lwk.WolletDescriptor(config.d);
            const wollet = new lwk.Wollet(network, wolletDescriptor);
            setWollet(wollet);

            // Show full wallet ID at bottom
            const dwid = wollet.dwid();
            walletIdDisplay.textContent = dwid;

            // Initialize currency and price fetcher
            const currencyCode = new lwk.CurrencyCode(currencyAlpha3);
            setCurrencyCode(currencyCode);

            const pricesFetcher = new lwk.PricesFetcher();
            setPricesFetcher(pricesFetcher);

            // Start rate updates
            startRateUpdates();

            // Hide loading status
            wasmStatus.classList.add('hidden');
        } catch (e) {
            console.error('Failed to initialize wallet:', e);
            const indicator = wasmStatus.querySelector('.status-indicator') as HTMLElement;
            const text = wasmStatus.querySelector('.status-text') as HTMLElement;
            indicator.classList.remove('loading');
            indicator.classList.add('error');
            text.textContent = `Error: ${e}`;
        }
    }

    // Subscribe to rate changes to update display
    subscribe('exchange-rate-changed', () => {
        formatDisplay();
    });

    // Initialize when WASM is ready
    if (isWasmReady()) {
        initWalletAsync();
    } else {
        subscribe('wasm-ready', (ready: boolean) => {
            if (ready) {
                initWalletAsync();
            }
        });
    }

    // Initialize display styles and values
    updateDisplayStyles();
    formatDisplay();
}

// =============================================================================
// Error Page
// =============================================================================

function initErrorPage(message: string): void {
    renderTemplate('error-page-template');

    const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
    errorMessage.textContent = message;
}

// =============================================================================
// Router
// =============================================================================

function route(): void {
    const hash = window.location.hash.slice(1); // Remove the '#'

    if (!hash) {
        // No hash = setup page
        initSetupPage();
        return;
    }

    // Try to decode the config
    const config = decodeConfig(hash);

    if (!config) {
        initErrorPage('The provided link is invalid or malformed. The configuration data could not be decoded.');
        return;
    }

    // Validate descriptor (basic check - full validation happens in POS page)
    if (!config.d || config.d.length < 10) {
        initErrorPage('The provided link is missing a valid descriptor.');
        return;
    }

    if (!config.c || config.c.length !== 3) {
        initErrorPage('The provided link is missing a valid currency code.');
        return;
    }

    // Show POS page
    initPosPage(config);
}

// =============================================================================
// Main Initialization
// =============================================================================

async function init(): Promise<void> {
    console.log('Bitcoin POS initializing...');

    // Route to correct page immediately (before WASM loads)
    route();

    // Handle hash changes (browser back/forward)
    window.addEventListener('hashchange', () => {
        stopRateUpdates();
        route();
    });

    // Mark WASM as ready
    setWasmReady(true);
    console.log('LWK WASM module loaded successfully');
    console.log('Network:', network.toString());
}

// Start the app
init();
