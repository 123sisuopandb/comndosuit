let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

const BitcoinWalletFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bitcoinwallet_free(ptr >>> 0, 1));

const WalletFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wallet_free(ptr >>> 0, 1));

/**
 * Bitcoin Wallet structure
 */
export class BitcoinWallet {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(BitcoinWallet.prototype);
        obj.__wbg_ptr = ptr;
        BitcoinWalletFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BitcoinWalletFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bitcoinwallet_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get private_key() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.bitcoinwallet_private_key(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get wif() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.bitcoinwallet_wif(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get address() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.bitcoinwallet_address(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) BitcoinWallet.prototype[Symbol.dispose] = BitcoinWallet.prototype.free;

/**
 * Wallet structure for EVM addresses
 */
export class Wallet {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Wallet.prototype);
        obj.__wbg_ptr = ptr;
        WalletFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wallet_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get private_key() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wallet_private_key(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get address() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wallet_address(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) Wallet.prototype[Symbol.dispose] = Wallet.prototype.free;

/**
 * @param {number} count
 * @returns {number}
 */
export function benchmark(count) {
    const ret = wasm.benchmark(count);
    return ret;
}

/**
 * @param {number} count
 * @param {string} address_type
 * @returns {number}
 */
export function benchmarkBitcoin(count, address_type) {
    const ptr0 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.benchmarkBitcoin(count, ptr0, len0);
    return ret;
}

/**
 * Find Bitcoin vanity address with both prefix and suffix
 * @param {string} prefix
 * @param {string} suffix
 * @param {string} address_type
 * @returns {BitcoinWallet}
 */
export function findBitcoinVanity(prefix, suffix, address_type) {
    const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(suffix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.findBitcoinVanity(ptr0, len0, ptr1, len1, ptr2, len2);
    return BitcoinWallet.__wrap(ret);
}

/**
 * Find Bitcoin vanity address with prefix
 * @param {string} prefix
 * @param {string} address_type
 * @returns {BitcoinWallet}
 */
export function findBitcoinVanityPrefix(prefix, address_type) {
    const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.findBitcoinVanityPrefix(ptr0, len0, ptr1, len1);
    return BitcoinWallet.__wrap(ret);
}

/**
 * Find Bitcoin vanity address with suffix
 * @param {string} suffix
 * @param {string} address_type
 * @returns {BitcoinWallet}
 */
export function findBitcoinVanitySuffix(suffix, address_type) {
    const ptr0 = passStringToWasm0(suffix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.findBitcoinVanitySuffix(ptr0, len0, ptr1, len1);
    return BitcoinWallet.__wrap(ret);
}

/**
 * @param {string} prefix
 * @returns {Wallet}
 */
export function findVanityAddress(prefix) {
    const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.findVanityAddress(ptr0, len0);
    return Wallet.__wrap(ret);
}

/**
 * @param {string} suffix
 * @returns {Wallet}
 */
export function findVanitySuffix(suffix) {
    const ptr0 = passStringToWasm0(suffix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.findVanitySuffix(ptr0, len0);
    return Wallet.__wrap(ret);
}

/**
 * Generate a batch of Bitcoin addresses within a range
 * Returns array of [privateKeyHex, address] pairs
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {number} count
 * @returns {Array<any>}
 */
export function generateBitcoinBatchInRange(range_start_hex, range_end_hex, count) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.generateBitcoinBatchInRange(ptr0, len0, ptr1, len1, count);
    return ret;
}

/**
 * Generate a Bitcoin Legacy (P2PKH) wallet
 * @returns {BitcoinWallet}
 */
export function generateBitcoinLegacy() {
    const ret = wasm.generateBitcoinLegacy();
    return BitcoinWallet.__wrap(ret);
}

/**
 * Generate a Bitcoin SegWit (P2WPKH) wallet
 * @returns {BitcoinWallet}
 */
export function generateBitcoinSegwit() {
    const ret = wasm.generateBitcoinSegwit();
    return BitcoinWallet.__wrap(ret);
}

/**
 * Generate a Bitcoin Taproot (P2TR) wallet
 * @returns {BitcoinWallet}
 */
export function generateBitcoinTaproot() {
    const ret = wasm.generateBitcoinTaproot();
    return BitcoinWallet.__wrap(ret);
}

/**
 * Generate Bitcoin address by type: "legacy", "segwit", "taproot"
 * @param {string} address_type
 * @returns {BitcoinWallet}
 */
export function generateBitcoinWallet(address_type) {
    const ptr0 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generateBitcoinWallet(ptr0, len0);
    return BitcoinWallet.__wrap(ret);
}

/**
 * @returns {Wallet}
 */
export function generateWallet() {
    const ret = wasm.generateWallet();
    return Wallet.__wrap(ret);
}

/**
 * @returns {Wallet}
 */
export function generateWalletChecksum() {
    const ret = wasm.generateWalletChecksum();
    return Wallet.__wrap(ret);
}

/**
 * @param {number} count
 * @returns {Array<any>}
 */
export function generateWallets(count) {
    const ret = wasm.generateWallets(count);
    return ret;
}

/**
 * @param {string} private_key_hex
 * @param {boolean} compressed
 * @returns {string}
 */
export function hexToWif(private_key_hex, compressed) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(private_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.hexToWif(ptr0, len0, compressed);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} address
 * @returns {boolean}
 */
export function isValidAddress(address) {
    const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.isValidAddress(ptr0, len0);
    return ret !== 0;
}

/**
 * @param {string} private_key_hex
 * @returns {string}
 */
export function privateKeyToAddress(private_key_hex) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(private_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.privateKeyToAddress(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} private_key_hex
 * @param {string} address_type
 * @returns {string}
 */
export function privateKeyToBitcoinAddress(private_key_hex, address_type) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(private_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.privateKeyToBitcoinAddress(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Debug: compare UltraFast point method vs standard SigningKey method
 * Returns: [pubkey_standard, pubkey_ultra, hash_standard, hash_ultra, match(0/1)]
 * @param {string} private_key_hex
 * @returns {Array<any>}
 */
export function puzzleDebugCompare(private_key_hex) {
    const ptr0 = passStringToWasm0(private_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleDebugCompare(ptr0, len0);
    return ret;
}

/**
 * Debug function to verify puzzle search logic
 * Returns: [targetHash160Hex, generatedAddress, generatedHash160Hex, match (0 or 1)]
 * @param {string} private_key_hex
 * @param {string} target_address
 * @returns {Array<any>}
 */
export function puzzleDebugVerify(private_key_hex, target_address) {
    const ptr0 = passStringToWasm0(private_key_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleDebugVerify(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * High-performance puzzle search - returns only count and match info
 * Minimizes JS-WASM boundary crossing
 * Uses cached range for maximum speed
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function puzzleSearchBatch(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchBatch(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * Ultra-fast puzzle search using hash160 comparison
 * Skips Base58 encoding in the hot loop - only encodes when match found
 * ~10% faster than puzzleSearchBatch
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function puzzleSearchBatchFast(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchBatchFast(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * HYBRID puzzle search - random start per batch, sequential increment with wrap
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function puzzleSearchHybrid(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchHybrid(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * PARTITIONED puzzle search - deterministic start from range_start
 * Each worker gets a unique partition and scans from the beginning
 * No overlap between workers = complete coverage guarantee
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @param {string} current_position_hex
 * @returns {Array<any>}
 */
export function puzzleSearchPartitioned(range_start_hex, range_end_hex, target_address, batch_size, current_position_hex) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(current_position_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchPartitioned(ptr0, len0, ptr1, len1, ptr2, len2, batch_size, ptr3, len3);
    return ret;
}

/**
 * Sequential puzzle search - starts from random point, then increments
 * Much faster than random search because:
 * 1. Only one getrandom() call per batch instead of batch_size calls
 * 2. Incrementing is a simple O(1) operation
 * Returns: [found (0 or 1), checked_count, privateKeyHex (if found), address (if found), wif (if found)]
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function puzzleSearchSequentialFast(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchSequentialFast(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * ULTRA-FAST puzzle search using incremental point addition
 * P_next = P + G (1 point add) instead of k*G (256 point ops) = ~10x faster
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function puzzleSearchUltraFast(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.puzzleSearchUltraFast(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * Search for a target Bitcoin address within a range
 * Returns: { found: bool, privateKey: string, address: string, checked: u32 }
 * @param {string} range_start_hex
 * @param {string} range_end_hex
 * @param {string} target_address
 * @param {number} batch_size
 * @returns {object}
 */
export function searchBitcoinPuzzle(range_start_hex, range_end_hex, target_address, batch_size) {
    const ptr0 = passStringToWasm0(range_start_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(range_end_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.searchBitcoinPuzzle(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * @param {string} address
 * @returns {string}
 */
export function toChecksumAddress(address) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.toChecksumAddress(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Batch vanity search for Bitcoin addresses using incremental point addition
 * Returns: [found (0/1), attempts, privateKeyHex, address, wif]
 * @param {string} prefix
 * @param {string} suffix
 * @param {string} address_type
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function vanitySearchBatchBitcoin(prefix, suffix, address_type, batch_size) {
    const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(suffix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(address_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.vanitySearchBatchBitcoin(ptr0, len0, ptr1, len1, ptr2, len2, batch_size);
    return ret;
}

/**
 * Batch vanity search for EVM addresses using incremental point addition
 * ULTRA-OPTIMIZED: Raw byte comparison, no hex conversion in hot loop
 * Returns: [found (0/1), attempts, privateKeyHex, address]
 * @param {string} prefix
 * @param {string} suffix
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function vanitySearchBatchEvm(prefix, suffix, batch_size) {
    const ptr0 = passStringToWasm0(prefix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(suffix, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.vanitySearchBatchEvm(ptr0, len0, ptr1, len1, batch_size);
    return ret;
}

/**
 * MULTI-PATTERN vanity search for EVM addresses
 * Case-insensitive matching, output preserves pattern case (e.g. aaA -> 0xaaA...)
 * patterns_js: Array of [prefix, suffix] pairs
 * Returns: [found (0/1), patternIndex, attempts, privateKeyHex, address]
 * @param {Array<any>} patterns_js
 * @param {number} batch_size
 * @returns {Array<any>}
 */
export function vanitySearchBatchEvmMulti(patterns_js, batch_size) {
    const ret = wasm.vanitySearchBatchEvmMulti(patterns_js, batch_size);
    return ret;
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
        const ret = debugString(arg1);
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_object_ce774f3490692386 = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_string_704ef9c8fc131030 = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg_call_3020136f7a2d6e44 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_abb4ff46ce38be40 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_crypto_574e78ad8b13b65f = function(arg0) {
        const ret = arg0.crypto;
        return ret;
    };
    imports.wbg.__wbg_from_29a8414a7a7cd19d = function(arg0) {
        const ret = Array.from(arg0);
        return ret;
    };
    imports.wbg.__wbg_getRandomValues_b8f5dbd5f3995a9e = function() { return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
    }, arguments) };
    imports.wbg.__wbg_get_6b7bd52aca3f9671 = function(arg0, arg1) {
        const ret = arg0[arg1 >>> 0];
        return ret;
    };
    imports.wbg.__wbg_instanceof_Window_b5cf7783caa68180 = function(arg0) {
        let result;
        try {
            result = arg0 instanceof Window;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_length_22ac23eaec9d8053 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_length_d45040a40c570362 = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_msCrypto_a61aeb35a24c1329 = function(arg0) {
        const ret = arg0.msCrypto;
        return ret;
    };
    imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
        const ret = new Object();
        return ret;
    };
    imports.wbg.__wbg_new_25f239778d6112b9 = function() {
        const ret = new Array();
        return ret;
    };
    imports.wbg.__wbg_new_no_args_cb138f77cf6151ee = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_new_with_length_aa5eaf41d35235e5 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_node_905d3e251edff8a2 = function(arg0) {
        const ret = arg0.node;
        return ret;
    };
    imports.wbg.__wbg_now_8cf15d6e317793e1 = function(arg0) {
        const ret = arg0.now();
        return ret;
    };
    imports.wbg.__wbg_performance_c77a440eff2efd9b = function(arg0) {
        const ret = arg0.performance;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_process_dc0fbacc7c1c06f7 = function(arg0) {
        const ret = arg0.process;
        return ret;
    };
    imports.wbg.__wbg_prototypesetcall_dfe9b766cdc1f1fd = function(arg0, arg1, arg2) {
        Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
    };
    imports.wbg.__wbg_push_7d9be8f38fc13975 = function(arg0, arg1) {
        const ret = arg0.push(arg1);
        return ret;
    };
    imports.wbg.__wbg_randomFillSync_ac0988aba3254290 = function() { return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
    }, arguments) };
    imports.wbg.__wbg_require_60cc747a6bc5215a = function() { return handleError(function () {
        const ret = module.require;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_set_781438a03c0c3c81 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = Reflect.set(arg0, arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_static_accessor_GLOBAL_769e6b65d6557335 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_60cf02db4de8e1c1 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_08f5a74c69739274 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_a8924b26aa92d024 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_subarray_845f2f5bce7d061a = function(arg0, arg1, arg2) {
        const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_versions_c01dfd4722a88165 = function(arg0) {
        const ret = arg0.versions;
        return ret;
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_cb9088102bce6b30 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
        const ret = getArrayU8FromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
        // Cast intrinsic for `F64 -> Externref`.
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('wallet_generator_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
