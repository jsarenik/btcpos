import * as lwk from "lwk_wasm"

// State management
let currentAmount: string = '0';
let currentCurrency: string = 'USD';
const amountDisplay = document.getElementById('amount') as HTMLSpanElement;
const satoshiDisplay = document.getElementById('satoshi-amount') as HTMLSpanElement;
const currencyCode = document.getElementById('currency-code') as HTMLSpanElement;
const currencySelect = document.getElementById('currency') as HTMLSelectElement;
const descriptionInput = document.getElementById('description') as HTMLInputElement;
const submitButton = document.getElementById('submit') as HTMLButtonElement;

// Exchange rates (1 BTC = 100,000,000 satoshis)
const BTC_PRICE_USD: number = 105000; // $105,000 per BTC
const EUR_TO_USD: number = 1.10; // 1 EUR = 1.10 USD
const SATOSHIS_PER_BTC: number = 100000000;

// Convert fiat to satoshis
function fiatToSatoshis(fiatAmount: number, currency: string): number {
    let amountInUSD: number = fiatAmount;

    // Convert to USD if needed
    if (currency === 'EUR') {
        amountInUSD = fiatAmount * EUR_TO_USD;
    }

    // Convert USD to BTC, then to satoshis
    const btcAmount: number = amountInUSD / BTC_PRICE_USD;
    const satoshis: number = Math.round(btcAmount * SATOSHIS_PER_BTC);

    return satoshis;
}

// Format the display with proper decimal places
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

    // Display current amount
    amountDisplay.textContent = currentAmount;

    // Calculate and display satoshis
    const fiatAmount: number = parseFloat(currentAmount);
    if (!isNaN(fiatAmount) && fiatAmount > 0) {
        const satoshis: number = fiatToSatoshis(fiatAmount, currentCurrency);
        satoshiDisplay.textContent = satoshis.toLocaleString('en-US');
    } else {
        satoshiDisplay.textContent = '0';
    }
}

// Update currency code
function updateCurrencyCode(): void {
    currencyCode.textContent = currentCurrency;
}

// Handle number and decimal point input
function handleInput(value: string): void {
    // Prevent multiple decimal points
    if (value === '.' && currentAmount.includes('.')) {
        return;
    }

    // Limit to 2 decimal places
    if (currentAmount.includes('.')) {
        const decimalPart = currentAmount.split('.')[1];
        if (decimalPart && decimalPart.length >= 2 && value !== '.') {
            return;
        }
    }

    // Limit total length to prevent overflow
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

// Add event listeners to keypad buttons
document.querySelectorAll('.key[data-value]').forEach((button: Element) => {
    button.addEventListener('click', () => {
        handleInput((button as HTMLButtonElement).dataset.value!);
    });
});

document.getElementById('backspace')!.addEventListener('click', handleBackspace);
document.getElementById('clear')!.addEventListener('click', handleClear);

// Handle currency change
currencySelect.addEventListener('change', (e: Event) => {
    currentCurrency = (e.target as HTMLSelectElement).value;
    updateCurrencyCode();
    formatDisplay(); // Recalculate satoshis with new currency
});

// Handle keyboard input
document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.target === descriptionInput) {
        return; // Don't capture keypad input when typing in description
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

// Handle submit
function handleSubmit(): void {
    const amount: number = parseFloat(currentAmount);
    const description: string = descriptionInput.value.trim();

    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount greater than 0');
        return;
    }

    const satoshis: number = fiatToSatoshis(amount, currentCurrency);

    // Here you would typically send this data to your backend
    const invoiceData = {
        fiatAmount: amount,
        currency: currentCurrency,
        satoshis: satoshis,
        description: description || null,
        timestamp: new Date().toISOString()
    };

    console.log('Invoice data:', invoiceData);

    // Show confirmation
    alert(`Invoice created!\n${currentCurrency}: ${amount.toFixed(2)}\nSatoshis: ${satoshis.toLocaleString('en-US')}\nDescription: ${description || 'None'}`);

    // Reset form
    currentAmount = '0';
    descriptionInput.value = '';
    formatDisplay();
}

submitButton.addEventListener('click', handleSubmit);

// Initialize display
updateCurrencyCode();
formatDisplay();

// Log LWK version on startup
console.log("LWK WASM module loaded successfully");

