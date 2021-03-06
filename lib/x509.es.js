/*!
 * MIT License
 * 
 * Copyright (c) Peculiar Ventures. All rights reserved.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */
import 'reflect-metadata';
import { AsnConvert, OctetString, AsnUtf8StringConverter } from '@peculiar/asn1-schema';
import * as asn1X509 from '@peculiar/asn1-x509';
import { Extension as Extension$1, Name as Name$1, AttributeTypeAndValue, RelativeDistinguishedName, AlgorithmIdentifier, SubjectPublicKeyInfo, Certificate, BasicConstraints, id_ce_basicConstraints, ExtendedKeyUsage, id_ce_extKeyUsage, KeyUsage, id_ce_keyUsage, SubjectKeyIdentifier, id_ce_subjectKeyIdentifier, Attribute as Attribute$1, Extensions } from '@peculiar/asn1-x509';
import { BufferSourceConverter, isEqual, Convert, combine } from 'pvtsutils';
import { container, injectable } from 'tsyringe';
import * as asn1Rsa from '@peculiar/asn1-rsa';
import { id_rsaEncryption, RSAPublicKey } from '@peculiar/asn1-rsa';
import * as asnPkcs9 from '@peculiar/asn1-pkcs9';
import { id_pkcs9_at_extensionRequest } from '@peculiar/asn1-pkcs9';
import { __decorate } from 'tslib';
import * as asn1Ecc from '@peculiar/asn1-ecc';
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { CertificationRequest, CertificationRequestInfo } from '@peculiar/asn1-csr';
import * as asn1Cms from '@peculiar/asn1-cms';

class AsnData {
    constructor(...args) {
        if (args.length === 1) {
            const asn = args[0];
            this.rawData = AsnConvert.serialize(asn);
            this.onInit(asn);
        }
        else {
            const asn = AsnConvert.parse(args[0], args[1]);
            this.rawData = BufferSourceConverter.toArrayBuffer(args[0]);
            this.onInit(asn);
        }
    }
    equal(data) {
        if (data instanceof AsnData) {
            return isEqual(data.rawData, this.rawData);
        }
        return false;
    }
}

class Extension extends AsnData {
    constructor(...args) {
        let raw;
        if (BufferSourceConverter.isBufferSource(args[0])) {
            raw = BufferSourceConverter.toArrayBuffer(args[0]);
        }
        else {
            raw = AsnConvert.serialize(new Extension$1({
                extnID: args[0],
                critical: args[1],
                extnValue: new OctetString(BufferSourceConverter.toArrayBuffer(args[2])),
            }));
        }
        super(raw, Extension$1);
    }
    onInit(asn) {
        this.type = asn.extnID;
        this.critical = asn.critical;
        this.value = asn.extnValue.buffer;
    }
}

class CryptoProvider extends Map {
    constructor() {
        super();
        if (typeof self !== "undefined" && typeof crypto !== "undefined") {
            this.set(CryptoProvider.DEFAULT, crypto);
        }
    }
    static isCryptoKeyPair(data) {
        return data && data.privateKey && data.publicKey;
    }
    static isCryptoKey(data) {
        return data && data.usages && data.type && data.algorithm && data.extractable !== undefined;
    }
    get(key = CryptoProvider.DEFAULT) {
        const crypto = super.get(key.toLowerCase());
        if (!crypto) {
            throw new Error(`Cannot get Crypto by name '${key}'`);
        }
        return crypto;
    }
    set(key, value) {
        if (typeof key === "string") {
            if (!value) {
                throw new TypeError("Argument 'value' is required");
            }
            super.set(key.toLowerCase(), value);
        }
        else {
            super.set(CryptoProvider.DEFAULT, key);
        }
        return this;
    }
}
CryptoProvider.DEFAULT = "default";
const cryptoProvider = new CryptoProvider();

class NameIdentifier {
    constructor() {
        this.items = {};
    }
    get(idOrName) {
        return this.items[idOrName] || null;
    }
    register(id, name) {
        this.items[id] = name;
        this.items[name] = id;
    }
}
const names = new NameIdentifier();
names.register("CN", "2.5.4.3");
names.register("L", "2.5.4.7");
names.register("ST", "2.5.4.8");
names.register("O", "2.5.4.10");
names.register("OU", "2.5.4.11");
names.register("C", "2.5.4.6");
names.register("DC", "0.9.2342.19200300.100.1.25");
names.register("E", "1.2.840.113549.1.9.1");
names.register("G", "2.5.4.42");
names.register("I", "2.5.4.43");
names.register("SN", "2.5.4.4");
names.register("T", "2.5.4.12");
function replaceUnknownCharacter(text, char) {
    return `\\${Convert.ToHex(Convert.FromUtf8String(char)).toUpperCase()}`;
}
function escape(data) {
    return data
        .replace(/([,+"\\<>;])/g, "\\$1")
        .replace(/^([ #])/, "\\$1")
        .replace(/([ ]$)/, "\\$1")
        .replace(/([\r\n\t])/, replaceUnknownCharacter);
}
class Name {
    constructor(data, extraNames = {}) {
        this.extraNames = new NameIdentifier();
        this.asn = new Name$1();
        for (const key in extraNames) {
            if (Object.prototype.hasOwnProperty.call(extraNames, key)) {
                const value = extraNames[key];
                this.extraNames.register(key, value);
            }
        }
        if (typeof data === "string") {
            this.asn = this.fromString(data);
        }
        else if (data instanceof Name$1) {
            this.asn = data;
        }
        else if (BufferSourceConverter.isBufferSource(data)) {
            this.asn = AsnConvert.parse(data, Name$1);
        }
        else {
            this.asn = this.fromJSON(data);
        }
    }
    getName(idOrName) {
        return this.extraNames.get(idOrName) || names.get(idOrName);
    }
    toString() {
        return this.asn.map(rdn => rdn.map(o => {
            const type = this.getName(o.type) || o.type;
            const value = o.value.anyValue
                ? `#${Convert.ToHex(o.value.anyValue)}`
                : escape(o.value.toString());
            return `${type}=${value}`;
        })
            .join("+"))
            .join(", ");
    }
    toJSON() {
        var _a;
        const json = [];
        for (const rdn of this.asn) {
            const jsonItem = {};
            for (const attr of rdn) {
                const type = this.getName(attr.type) || attr.type;
                (_a = jsonItem[type]) !== null && _a !== void 0 ? _a : (jsonItem[type] = []);
                jsonItem[type].push(attr.value.anyValue ? `#${Convert.ToHex(attr.value.anyValue)}` : attr.value.toString());
            }
            json.push(jsonItem);
        }
        return json;
    }
    fromString(data) {
        const asn = new Name$1();
        const regex = /(\d\.[\d.]*\d|[A-Za-z]+)=((?:"")|(?:".*?[^\\]")|(?:[^,+].*?(?:[^\\][,+]))|(?:))([,+])?/g;
        let matches = null;
        let level = ",";
        while (matches = regex.exec(`${data},`)) {
            let [, type, value] = matches;
            const lastChar = value[value.length - 1];
            if (lastChar === "," || lastChar === "+") {
                value = value.slice(0, value.length - 1);
                matches[3] = lastChar;
            }
            const next = matches[3];
            if (!/[\d.]+/.test(type)) {
                type = this.getName(type) || "";
            }
            if (!type) {
                throw new Error(`Cannot get OID for name type '${type}'`);
            }
            const attr = new AttributeTypeAndValue({ type });
            if (value.charAt(0) === "#") {
                attr.value.anyValue = Convert.FromHex(value.slice(1));
            }
            else {
                const quotedMatches = /"(.*?[^\\])?"/.exec(value);
                if (quotedMatches) {
                    value = quotedMatches[1];
                }
                value = value
                    .replace(/\\0a/ig, "\n")
                    .replace(/\\0d/ig, "\r")
                    .replace(/\\0g/ig, "\t")
                    .replace(/\\(.)/g, "$1");
                if (type === this.getName("E") || type === this.getName("DC")) {
                    attr.value.ia5String = value;
                }
                else {
                    attr.value.printableString = value;
                }
            }
            if (level === "+") {
                asn[asn.length - 1].push(attr);
            }
            else {
                asn.push(new RelativeDistinguishedName([attr]));
            }
            level = next;
        }
        return asn;
    }
    fromJSON(data) {
        const asn = new Name$1();
        for (const item of data) {
            const asnRdn = new RelativeDistinguishedName();
            for (const type in item) {
                let typeId = type;
                if (!/[\d.]+/.test(type)) {
                    typeId = this.getName(type) || "";
                }
                if (!typeId) {
                    throw new Error(`Cannot get OID for name type '${type}'`);
                }
                const values = item[type];
                for (const value of values) {
                    const asnAttr = new AttributeTypeAndValue({ type: typeId });
                    if (value[0] === "#") {
                        asnAttr.value.anyValue = Convert.FromHex(value.slice(1));
                    }
                    else {
                        if (typeId === this.getName("E") || typeId === this.getName("DC")) {
                            asnAttr.value.ia5String = value;
                        }
                        else {
                            asnAttr.value.printableString = value;
                        }
                    }
                    asnRdn.push(asnAttr);
                }
            }
            asn.push(asnRdn);
        }
        return asn;
    }
    toArrayBuffer() {
        return AsnConvert.serialize(this.asn);
    }
}

class ExtensionFactory {
    static register(id, type) {
        this.items.set(id, type);
    }
    static create(data) {
        const extension = new Extension(data);
        const Type = this.items.get(extension.type);
        if (Type) {
            return new Type(data);
        }
        return extension;
    }
}
ExtensionFactory.items = new Map();

const diAlgorithm = "crypto.algorithm";
class AlgorithmProvider {
    getAlgorithms() {
        return container.resolveAll(diAlgorithm);
    }
    toAsnAlgorithm(alg) {
        for (const algorithm of this.getAlgorithms()) {
            const res = algorithm.toAsnAlgorithm(alg);
            if (res) {
                return res;
            }
        }
        if (/[0-9.]+/.test(alg.name)) {
            const res = new AlgorithmIdentifier({
                algorithm: alg.name,
            });
            if ("parameters" in alg) {
                const unknown = alg;
                res.parameters = unknown.parameters;
            }
            return res;
        }
        throw new Error("Cannot convert WebCrypto algorithm to ASN.1 algorithm");
    }
    toWebAlgorithm(alg) {
        for (const algorithm of this.getAlgorithms()) {
            const res = algorithm.toWebAlgorithm(alg);
            if (res) {
                return res;
            }
        }
        const unknown = {
            name: alg.algorithm,
            parameters: alg.parameters,
        };
        return unknown;
    }
}
const diAlgorithmProvider = "crypto.algorithmProvider";
container.registerSingleton(diAlgorithmProvider, AlgorithmProvider);

class PemConverter {
    constructor() {
        this.CertificateTag = "CERTIFICATE";
        this.CertificateRequestTag = "CERTIFICATE REQUEST";
        this.PublicKeyTag = "PUBLIC KEY";
        this.PrivateKeyTag = "PRIVATE KEY";
    }
    static isPem(data) {
        return typeof data === "string"
            && /-{5}BEGIN [A-Z0-9 ]+-{5}([a-zA-Z0-9=+/\n\r]+)-{5}END [A-Z0-9 ]+-{5}/g.test(data);
    }
    static decode(pem) {
        const pattern = /-{5}BEGIN [A-Z0-9 ]+-{5}([a-zA-Z0-9=+/\n\r]+)-{5}END [A-Z0-9 ]+-{5}/g;
        const res = [];
        let matches = null;
        while (matches = pattern.exec(pem)) {
            const base64 = matches[1]
                .replace(/\r/g, "")
                .replace(/\n/g, "");
            res.push(Convert.FromBase64(base64));
        }
        return res;
    }
    static encode(rawData, tag) {
        if (Array.isArray(rawData)) {
            const raws = new Array();
            rawData.forEach(element => {
                raws.push(this.encodeBuffer(element, tag));
            });
            return raws.join("\n");
        }
        else {
            return this.encodeBuffer(rawData, tag);
        }
    }
    static encodeBuffer(rawData, tag) {
        const base64 = Convert.ToBase64(rawData);
        let sliced;
        let offset = 0;
        const rows = Array();
        while (offset < base64.length) {
            if (base64.length - offset < 64) {
                sliced = base64.substring(offset);
            }
            else {
                sliced = base64.substring(offset, offset + 64);
                offset += 64;
            }
            if (sliced.length !== 0) {
                rows.push(sliced);
                if (sliced.length < 64) {
                    break;
                }
            }
            else {
                break;
            }
        }
        const upperCaseTag = tag.toLocaleUpperCase();
        return `-----BEGIN ${upperCaseTag}-----\n${rows.join("\n")}\n-----END ${upperCaseTag}-----`;
    }
}

class PemData extends AsnData {
    static isAsnEncoded(data) {
        return BufferSourceConverter.isBufferSource(data) || typeof data === "string";
    }
    static toArrayBuffer(raw) {
        if (typeof raw === "string") {
            if (PemConverter.isPem(raw)) {
                return PemConverter.decode(raw)[0];
            }
            else if (Convert.isHex(raw)) {
                return Convert.FromHex(raw);
            }
            else if (Convert.isBase64(raw)) {
                return Convert.FromBase64(raw);
            }
            else if (Convert.isBase64Url(raw)) {
                return Convert.FromBase64Url(raw);
            }
            else {
                throw new TypeError("Unsupported format of 'raw' argument. Must be one of DER, PEM, HEX, Base64, or Base4Url");
            }
        }
        else {
            return raw;
        }
    }
    constructor(...args) {
        if (PemData.isAsnEncoded(args[0])) {
            super(PemData.toArrayBuffer(args[0]), args[1]);
        }
        else {
            super(args[0]);
        }
    }
    toString(format = "pem") {
        switch (format) {
            case "pem":
                return PemConverter.encode(this.rawData, this.tag);
            case "hex":
                return Convert.ToHex(this.rawData);
            case "base64":
                return Convert.ToBase64(this.rawData);
            case "base64url":
                return Convert.ToBase64Url(this.rawData);
            default:
                throw TypeError("Argument 'format' is unsupported value");
        }
    }
}

class PublicKey extends PemData {
    constructor(param) {
        if (PemData.isAsnEncoded(param)) {
            super(param, SubjectPublicKeyInfo);
        }
        else {
            super(param);
        }
        this.tag = "PUBLIC KEY";
    }
    async export(...args) {
        let crypto;
        let keyUsages = ["verify"];
        let algorithm = { hash: "SHA-256", ...this.algorithm };
        if (args.length > 1) {
            algorithm = args[0] || algorithm;
            keyUsages = args[1] || keyUsages;
            crypto = args[2] || cryptoProvider.get();
        }
        else {
            crypto = args[0] || cryptoProvider.get();
        }
        return crypto.subtle.importKey("spki", this.rawData, algorithm, true, keyUsages);
    }
    onInit(asn) {
        const algProv = container.resolve(diAlgorithmProvider);
        const algorithm = this.algorithm = algProv.toWebAlgorithm(asn.algorithm);
        switch (asn.algorithm.algorithm) {
            case id_rsaEncryption:
                {
                    const rsaPublicKey = AsnConvert.parse(asn.subjectPublicKey, RSAPublicKey);
                    const modulus = BufferSourceConverter.toUint8Array(rsaPublicKey.modulus);
                    algorithm.publicExponent = BufferSourceConverter.toUint8Array(rsaPublicKey.publicExponent);
                    algorithm.modulusLength = (!modulus[0] ? modulus.slice(1) : modulus).byteLength << 3;
                    break;
                }
        }
    }
    async getThumbprint(...args) {
        var _a;
        let crypto;
        let algorithm = "SHA-1";
        if (args.length >= 1 && !((_a = args[0]) === null || _a === void 0 ? void 0 : _a.subtle)) {
            algorithm = args[0] || algorithm;
            crypto = args[1] || cryptoProvider.get();
        }
        else {
            crypto = args[0] || cryptoProvider.get();
        }
        return await crypto.subtle.digest(algorithm, this.rawData);
    }
}

const diAsnSignatureFormatter = "crypto.signatureFormatter";
class AsnDefaultSignatureFormatter {
    toAsnSignature(algorithm, signature) {
        return BufferSourceConverter.toArrayBuffer(signature);
    }
    toWebSignature(algorithm, signature) {
        return BufferSourceConverter.toArrayBuffer(signature);
    }
}

class X509Certificate extends PemData {
    constructor(param) {
        if (PemData.isAsnEncoded(param)) {
            super(param, Certificate);
        }
        else {
            super(param);
        }
        this.tag = "CERTIFICATE";
    }
    onInit(asn) {
        const tbs = asn.tbsCertificate;
        this.tbs = AsnConvert.serialize(tbs);
        this.serialNumber = Convert.ToHex(tbs.serialNumber);
        this.subject = new Name(tbs.subject).toString();
        this.issuer = new Name(tbs.issuer).toString();
        const algProv = container.resolve(diAlgorithmProvider);
        this.signatureAlgorithm = algProv.toWebAlgorithm(asn.signatureAlgorithm);
        this.signature = asn.signatureValue;
        const notBefore = tbs.validity.notBefore.utcTime || tbs.validity.notBefore.generalTime;
        if (!notBefore) {
            throw new Error("Cannot get 'notBefore' value");
        }
        this.notBefore = notBefore;
        const notAfter = tbs.validity.notAfter.utcTime || tbs.validity.notAfter.generalTime;
        if (!notAfter) {
            throw new Error("Cannot get 'notAfter' value");
        }
        this.notAfter = notAfter;
        this.extensions = [];
        if (tbs.extensions) {
            this.extensions = tbs.extensions.map(o => ExtensionFactory.create(AsnConvert.serialize(o)));
        }
        this.publicKey = new PublicKey(tbs.subjectPublicKeyInfo);
    }
    getExtension(type) {
        for (const ext of this.extensions) {
            if (typeof type === "string") {
                if (ext.type === type) {
                    return ext;
                }
            }
            else {
                if (ext instanceof type) {
                    return ext;
                }
            }
        }
        return null;
    }
    getExtensions(type) {
        return this.extensions.filter(o => {
            if (typeof type === "string") {
                return o.type === type;
            }
            else {
                return o instanceof type;
            }
        });
    }
    async verify(params = {}, crypto = cryptoProvider.get()) {
        let keyAlgorithm;
        let publicKey;
        const paramsKey = params.publicKey;
        try {
            if (!paramsKey) {
                keyAlgorithm = { ...this.publicKey.algorithm, ...this.signatureAlgorithm };
                publicKey = await this.publicKey.export(keyAlgorithm, ["verify"], crypto);
            }
            else if (paramsKey instanceof X509Certificate) {
                keyAlgorithm = { ...paramsKey.publicKey.algorithm, ...this.signatureAlgorithm };
                publicKey = await paramsKey.publicKey.export(keyAlgorithm, ["verify"]);
            }
            else if (paramsKey instanceof PublicKey) {
                keyAlgorithm = { ...paramsKey.algorithm, ...this.signatureAlgorithm };
                publicKey = await paramsKey.export(keyAlgorithm, ["verify"]);
            }
            else {
                keyAlgorithm = { ...paramsKey.algorithm, ...this.signatureAlgorithm };
                publicKey = paramsKey;
            }
        }
        catch (e) {
            return false;
        }
        const signatureFormatters = container.resolveAll(diAsnSignatureFormatter).reverse();
        let signature = null;
        for (const signatureFormatter of signatureFormatters) {
            signature = signatureFormatter.toWebSignature(keyAlgorithm, this.signature);
            if (signature) {
                break;
            }
        }
        if (!signature) {
            throw Error("Cannot convert ASN.1 signature value to WebCrypto format");
        }
        const ok = await crypto.subtle.verify(this.signatureAlgorithm, publicKey, signature, this.tbs);
        if (params.signatureOnly) {
            return ok;
        }
        else {
            const date = params.date || new Date();
            const time = date.getTime();
            return ok && this.notBefore.getTime() < time && time < this.notAfter.getTime();
        }
    }
    async getThumbprint(...args) {
        let crypto;
        let algorithm = "SHA-1";
        if (args[0]) {
            if (!args[0].subtle) {
                algorithm = args[0] || algorithm;
                crypto = args[1];
            }
            else {
                crypto = args[0];
            }
        }
        crypto !== null && crypto !== void 0 ? crypto : (crypto = cryptoProvider.get());
        return await crypto.subtle.digest(algorithm, this.rawData);
    }
    async isSelfSigned() {
        return this.subject === this.issuer && await this.verify({ signatureOnly: true });
    }
}

class AuthorityKeyIdentifierExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
        }
        else if (typeof args[0] === "string") {
            const value = new asn1X509.AuthorityKeyIdentifier({ keyIdentifier: new OctetString(Convert.FromHex(args[0])) });
            super(asn1X509.id_ce_authorityKeyIdentifier, args[1], AsnConvert.serialize(value));
        }
        else {
            const certId = args[0];
            const value = new asn1X509.AuthorityKeyIdentifier({
                authorityCertIssuer: certId.name,
                authorityCertSerialNumber: Convert.FromHex(certId.serialNumber),
            });
            super(asn1X509.id_ce_authorityKeyIdentifier, args[1], AsnConvert.serialize(value));
        }
    }
    static async create(param, critical = false, crypto = cryptoProvider.get()) {
        if (param instanceof X509Certificate || CryptoProvider.isCryptoKey(param)) {
            const publicKey = param instanceof X509Certificate ? await param.publicKey.export(crypto) : param;
            const spki = await crypto.subtle.exportKey("spki", publicKey);
            const ski = await crypto.subtle.digest("SHA-1", spki);
            return new AuthorityKeyIdentifierExtension(Convert.ToHex(ski), critical);
        }
        else {
            return new AuthorityKeyIdentifierExtension(param, critical);
        }
    }
    onInit(asn) {
        super.onInit(asn);
        const aki = AsnConvert.parse(asn.extnValue, asn1X509.AuthorityKeyIdentifier);
        if (aki.keyIdentifier) {
            this.keyId = Convert.ToHex(aki.keyIdentifier);
        }
        if (aki.authorityCertIssuer && aki.authorityCertSerialNumber) {
            this.certId = {
                name: aki.authorityCertIssuer,
                serialNumber: Convert.ToHex(aki.authorityCertSerialNumber),
            };
        }
    }
}

class BasicConstraintsExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
            const value = AsnConvert.parse(this.value, BasicConstraints);
            this.ca = value.cA;
            this.pathLength = value.pathLenConstraint;
        }
        else {
            const value = new BasicConstraints({
                cA: args[0],
                pathLenConstraint: args[1],
            });
            super(id_ce_basicConstraints, args[2], AsnConvert.serialize(value));
            this.ca = args[0];
            this.pathLength = args[1];
        }
    }
}

class ExtendedKeyUsageExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
            const value = AsnConvert.parse(this.value, ExtendedKeyUsage);
            this.usages = value.map(o => o);
        }
        else {
            const value = new ExtendedKeyUsage(args[0]);
            super(id_ce_extKeyUsage, args[1], AsnConvert.serialize(value));
            this.usages = args[0];
        }
    }
}

var KeyUsageFlags;
(function (KeyUsageFlags) {
    KeyUsageFlags[KeyUsageFlags["digitalSignature"] = 1] = "digitalSignature";
    KeyUsageFlags[KeyUsageFlags["nonRepudiation"] = 2] = "nonRepudiation";
    KeyUsageFlags[KeyUsageFlags["keyEncipherment"] = 4] = "keyEncipherment";
    KeyUsageFlags[KeyUsageFlags["dataEncipherment"] = 8] = "dataEncipherment";
    KeyUsageFlags[KeyUsageFlags["keyAgreement"] = 16] = "keyAgreement";
    KeyUsageFlags[KeyUsageFlags["keyCertSign"] = 32] = "keyCertSign";
    KeyUsageFlags[KeyUsageFlags["cRLSign"] = 64] = "cRLSign";
    KeyUsageFlags[KeyUsageFlags["encipherOnly"] = 128] = "encipherOnly";
    KeyUsageFlags[KeyUsageFlags["decipherOnly"] = 256] = "decipherOnly";
})(KeyUsageFlags || (KeyUsageFlags = {}));
class KeyUsagesExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
            const value = AsnConvert.parse(this.value, KeyUsage);
            this.usages = value.toNumber();
        }
        else {
            const value = new KeyUsage(args[0]);
            super(id_ce_keyUsage, args[1], AsnConvert.serialize(value));
            this.usages = args[0];
        }
    }
}

class SubjectKeyIdentifierExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
            const value = AsnConvert.parse(this.value, SubjectKeyIdentifier);
            this.keyId = Convert.ToHex(value);
        }
        else {
            const identifier = typeof args[0] === "string"
                ? Convert.FromHex(args[0])
                : args[0];
            const value = new SubjectKeyIdentifier(identifier);
            super(id_ce_subjectKeyIdentifier, args[1], AsnConvert.serialize(value));
            this.keyId = Convert.ToHex(identifier);
        }
    }
    static async create(publicKey, critical = false, crypto = cryptoProvider.get()) {
        const spki = await crypto.subtle.exportKey("spki", publicKey);
        const ski = await crypto.subtle.digest("SHA-1", spki);
        return new SubjectKeyIdentifierExtension(Convert.ToHex(ski), critical);
    }
}

class OtherName extends AsnData {
    constructor(...args) {
        let raw;
        if (BufferSourceConverter.isBufferSource(args[0])) {
            raw = BufferSourceConverter.toArrayBuffer(args[0]);
        }
        else {
            const type = args[0];
            const value = BufferSourceConverter.toArrayBuffer(args[1]);
            raw = AsnConvert.serialize(new asn1X509.OtherName({ typeId: type, value }));
        }
        super(raw, asn1X509.OtherName);
    }
    onInit(asn) {
        this.type = asn.typeId;
        this.value = asn.value;
    }
    toJSON() {
        return {
            type: this.type,
            value: Convert.ToHex(this.value),
        };
    }
}
class SubjectAlternativeNameExtension extends Extension {
    constructor(...args) {
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
        }
        else {
            const data = args[0] || {};
            const value = new asn1X509.SubjectAlternativeName();
            for (const item of data.dns || []) {
                value.push(new asn1X509.GeneralName({
                    dNSName: item,
                }));
            }
            for (const item of data.email || []) {
                value.push(new asn1X509.GeneralName({
                    rfc822Name: item,
                }));
            }
            for (const item of data.guid || []) {
                const matches = /([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})/i.exec(item);
                if (!matches) {
                    throw new Error("Cannot parse GUID value. Value doesn't match to regular expression");
                }
                const hex = matches
                    .slice(1)
                    .map((o, i) => {
                    if (i < 3) {
                        return Convert.ToHex(new Uint8Array(Convert.FromHex(o)).reverse());
                    }
                    return o;
                })
                    .join("");
                value.push(new asn1X509.GeneralName({
                    otherName: new asn1X509.OtherName({
                        typeId: SubjectAlternativeNameExtension.GUID,
                        value: AsnConvert.serialize(new OctetString(Convert.FromHex(hex))),
                    }),
                }));
            }
            for (const item of data.ip || []) {
                value.push(new asn1X509.GeneralName({
                    iPAddress: item,
                }));
            }
            for (const item of data.url || []) {
                value.push(new asn1X509.GeneralName({
                    uniformResourceIdentifier: item,
                }));
            }
            for (const item of data.upn || []) {
                value.push(new asn1X509.GeneralName({
                    otherName: new asn1X509.OtherName({
                        typeId: SubjectAlternativeNameExtension.UPN,
                        value: AsnConvert.serialize(AsnUtf8StringConverter.toASN(item))
                    }),
                }));
            }
            for (const item of data.registeredId || []) {
                value.push(new asn1X509.GeneralName({
                    registeredID: item,
                }));
            }
            for (const item of data.otherName || []) {
                value.push(new asn1X509.GeneralName({
                    otherName: new asn1X509.OtherName({
                        typeId: item.type,
                        value: Convert.FromHex(item.value),
                    }),
                }));
            }
            super(asn1X509.id_ce_subjectAltName, args[1], AsnConvert.serialize(value));
        }
    }
    onInit(asn) {
        super.onInit(asn);
        const value = AsnConvert.parse(asn.extnValue, asn1X509.SubjectAlternativeName);
        this.dns = value.filter(o => o.dNSName).map(o => o.dNSName || "");
        this.email = value.filter(o => o.rfc822Name).map(o => o.rfc822Name || "");
        this.ip = value.filter(o => o.iPAddress).map(o => o.iPAddress || "");
        this.url = value.filter(o => o.uniformResourceIdentifier).map(o => o.uniformResourceIdentifier || "");
        this.upn = value
            .filter(o => { var _a; return ((_a = o.otherName) === null || _a === void 0 ? void 0 : _a.typeId) === SubjectAlternativeNameExtension.UPN; })
            .map(o => o.otherName ? AsnConvert.parse(o.otherName.value, asn1X509.DirectoryString).toString() : "");
        this.guid = value
            .filter(o => { var _a; return ((_a = o.otherName) === null || _a === void 0 ? void 0 : _a.typeId) === SubjectAlternativeNameExtension.GUID; })
            .map(o => o.otherName ? AsnConvert.parse(o.otherName.value, OctetString) : new OctetString())
            .map(o => {
            const matches = /([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})/i.exec(Convert.ToHex(o));
            if (!matches) {
                throw new Error("Cannot parse GUID value. Value doesn't match to regular expression");
            }
            const guid = matches
                .slice(1)
                .map((o, i) => {
                if (i < 3) {
                    return Convert.ToHex(new Uint8Array(Convert.FromHex(o)).reverse());
                }
                return o;
            })
                .join("-");
            return `{${guid}}`;
        });
        this.registeredId = value.filter(o => o.registeredID).map(o => o.registeredID || "");
        this.otherNames = value
            .filter(o => o.otherName && ![SubjectAlternativeNameExtension.GUID, SubjectAlternativeNameExtension.UPN].includes(o.otherName.typeId))
            .map(o => new OtherName(o.otherName.typeId, o.otherName.value));
    }
    toJSON() {
        const json = {};
        if (this.dns.length) {
            json.dns = [...this.dns];
        }
        if (this.email.length) {
            json.email = [...this.email];
        }
        if (this.ip.length) {
            json.ip = [...this.ip];
        }
        if (this.guid.length) {
            json.guid = [...this.guid];
        }
        if (this.upn.length) {
            json.upn = [...this.upn];
        }
        if (this.url.length) {
            json.url = [...this.url];
        }
        if (this.registeredId.length) {
            json.registeredId = [...this.registeredId];
        }
        if (this.otherNames.length) {
            json.otherName = this.otherNames.map(o => o.toJSON());
        }
        return json;
    }
}
SubjectAlternativeNameExtension.GUID = "1.3.6.1.4.1.311.25.1";
SubjectAlternativeNameExtension.UPN = "1.3.6.1.4.1.311.20.2.3";

class Attribute extends AsnData {
    constructor(...args) {
        let raw;
        if (BufferSourceConverter.isBufferSource(args[0])) {
            raw = BufferSourceConverter.toArrayBuffer(args[0]);
        }
        else {
            const type = args[0];
            const values = Array.isArray(args[1]) ? args[1].map(o => BufferSourceConverter.toArrayBuffer(o)) : [];
            raw = AsnConvert.serialize(new Attribute$1({ type, values }));
        }
        super(raw, Attribute$1);
    }
    onInit(asn) {
        this.type = asn.type;
        this.values = asn.values;
    }
}

class ChallengePasswordAttribute extends Attribute {
    constructor(...args) {
        var _a;
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
        }
        else {
            const value = new asnPkcs9.ChallengePassword({
                printableString: args[0],
            });
            super(asnPkcs9.id_pkcs9_at_challengePassword, [AsnConvert.serialize(value)]);
        }
        (_a = this.password) !== null && _a !== void 0 ? _a : (this.password = "");
    }
    onInit(asn) {
        super.onInit(asn);
        if (this.values[0]) {
            const value = AsnConvert.parse(this.values[0], asnPkcs9.ChallengePassword);
            this.password = value.toString();
        }
    }
}

class ExtensionsAttribute extends Attribute {
    constructor(...args) {
        var _a;
        if (BufferSourceConverter.isBufferSource(args[0])) {
            super(args[0]);
        }
        else {
            const value = new asn1X509.Extensions(args[0]);
            super(asnPkcs9.id_pkcs9_at_extensionRequest, [AsnConvert.serialize(value)]);
        }
        (_a = this.items) !== null && _a !== void 0 ? _a : (this.items = []);
    }
    onInit(asn) {
        super.onInit(asn);
        if (this.values[0]) {
            const value = AsnConvert.parse(this.values[0], asn1X509.Extensions);
            this.items = value.map(o => ExtensionFactory.create(AsnConvert.serialize(o)));
        }
    }
}

class AttributeFactory {
    static register(id, type) {
        this.items.set(id, type);
    }
    static create(data) {
        const attribute = new Attribute(data);
        const Type = this.items.get(attribute.type);
        if (Type) {
            return new Type(data);
        }
        return attribute;
    }
}
AttributeFactory.items = new Map();

let RsaAlgorithm = class RsaAlgorithm {
    toAsnAlgorithm(alg) {
        switch (alg.name.toLowerCase()) {
            case "rsassa-pkcs1-v1_5":
                if (alg.hash) {
                    switch (alg.hash.name.toLowerCase()) {
                        case "sha-1":
                            return new AlgorithmIdentifier({ algorithm: asn1Rsa.id_sha1WithRSAEncryption, parameters: null });
                        case "sha-256":
                            return new AlgorithmIdentifier({ algorithm: asn1Rsa.id_sha256WithRSAEncryption, parameters: null });
                        case "sha-384":
                            return new AlgorithmIdentifier({ algorithm: asn1Rsa.id_sha384WithRSAEncryption, parameters: null });
                        case "sha-512":
                            return new AlgorithmIdentifier({ algorithm: asn1Rsa.id_sha512WithRSAEncryption, parameters: null });
                    }
                }
                else {
                    return new AlgorithmIdentifier({ algorithm: asn1Rsa.id_rsaEncryption, parameters: null });
                }
        }
        return null;
    }
    toWebAlgorithm(alg) {
        switch (alg.algorithm) {
            case asn1Rsa.id_rsaEncryption:
                return { name: "RSASSA-PKCS1-v1_5" };
            case asn1Rsa.id_sha1WithRSAEncryption:
                return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-1" } };
            case asn1Rsa.id_sha256WithRSAEncryption:
                return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } };
            case asn1Rsa.id_sha384WithRSAEncryption:
                return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-384" } };
            case asn1Rsa.id_sha512WithRSAEncryption:
                return { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-512" } };
        }
        return null;
    }
};
RsaAlgorithm = __decorate([
    injectable()
], RsaAlgorithm);
container.registerSingleton(diAlgorithm, RsaAlgorithm);

var EcAlgorithm_1;
let EcAlgorithm = EcAlgorithm_1 = class EcAlgorithm {
    toAsnAlgorithm(alg) {
        switch (alg.name.toLowerCase()) {
            case "ecdsa":
                if ("hash" in alg) {
                    const hash = typeof alg.hash === "string" ? alg.hash : alg.hash.name;
                    switch (hash.toLowerCase()) {
                        case "sha-1":
                            return asn1Ecc.ecdsaWithSHA1;
                        case "sha-256":
                            return asn1Ecc.ecdsaWithSHA256;
                        case "sha-384":
                            return asn1Ecc.ecdsaWithSHA384;
                        case "sha-512":
                            return asn1Ecc.ecdsaWithSHA512;
                    }
                }
                else if ("namedCurve" in alg) {
                    let parameters = "";
                    switch (alg.namedCurve) {
                        case "P-256":
                            parameters = asn1Ecc.id_secp256r1;
                            break;
                        case "K-256":
                            parameters = EcAlgorithm_1.SECP256K1;
                            break;
                        case "P-384":
                            parameters = asn1Ecc.id_secp384r1;
                            break;
                        case "P-521":
                            parameters = asn1Ecc.id_secp521r1;
                            break;
                    }
                    if (parameters) {
                        return new AlgorithmIdentifier({
                            algorithm: asn1Ecc.id_ecPublicKey,
                            parameters: AsnConvert.serialize(new asn1Ecc.ECParameters({ namedCurve: parameters })),
                        });
                    }
                }
        }
        return null;
    }
    toWebAlgorithm(alg) {
        switch (alg.algorithm) {
            case asn1Ecc.id_ecdsaWithSHA1:
                return { name: "ECDSA", hash: { name: "SHA-1" } };
            case asn1Ecc.id_ecdsaWithSHA256:
                return { name: "ECDSA", hash: { name: "SHA-256" } };
            case asn1Ecc.id_ecdsaWithSHA384:
                return { name: "ECDSA", hash: { name: "SHA-384" } };
            case asn1Ecc.id_ecdsaWithSHA512:
                return { name: "ECDSA", hash: { name: "SHA-512" } };
            case asn1Ecc.id_ecPublicKey: {
                if (!alg.parameters) {
                    throw new TypeError("Cannot get required parameters from EC algorithm");
                }
                const parameters = AsnConvert.parse(alg.parameters, asn1Ecc.ECParameters);
                switch (parameters.namedCurve) {
                    case asn1Ecc.id_secp256r1:
                        return { name: "ECDSA", namedCurve: "P-256" };
                    case EcAlgorithm_1.SECP256K1:
                        return { name: "ECDSA", namedCurve: "K-256" };
                    case asn1Ecc.id_secp384r1:
                        return { name: "ECDSA", namedCurve: "P-384" };
                    case asn1Ecc.id_secp521r1:
                        return { name: "ECDSA", namedCurve: "P-521" };
                }
            }
        }
        return null;
    }
};
EcAlgorithm.SECP256K1 = "1.3.132.0.10";
EcAlgorithm = EcAlgorithm_1 = __decorate([
    injectable()
], EcAlgorithm);
container.registerSingleton(diAlgorithm, EcAlgorithm);

class AsnEcSignatureFormatter {
    addPadding(pointSize, data) {
        const bytes = BufferSourceConverter.toUint8Array(data);
        const res = new Uint8Array(pointSize);
        res.set(bytes, pointSize - bytes.length);
        return res;
    }
    removePadding(data, positive = false) {
        let bytes = BufferSourceConverter.toUint8Array(data);
        for (let i = 0; i < bytes.length; i++) {
            if (!bytes[i]) {
                continue;
            }
            bytes = bytes.slice(i);
            break;
        }
        if (positive && bytes[0] > 127) {
            const result = new Uint8Array(bytes.length + 1);
            result.set(bytes, 1);
            return result.buffer;
        }
        return bytes.buffer;
    }
    toAsnSignature(algorithm, signature) {
        if (algorithm.name === "ECDSA") {
            const namedCurve = algorithm.namedCurve;
            const pointSize = AsnEcSignatureFormatter.namedCurveSize.get(namedCurve) || AsnEcSignatureFormatter.defaultNamedCurveSize;
            const ecSignature = new ECDSASigValue();
            const uint8Signature = BufferSourceConverter.toUint8Array(signature);
            ecSignature.r = this.removePadding(uint8Signature.slice(0, pointSize), true);
            ecSignature.s = this.removePadding(uint8Signature.slice(pointSize, pointSize + pointSize), true);
            return AsnConvert.serialize(ecSignature);
        }
        return null;
    }
    toWebSignature(algorithm, signature) {
        if (algorithm.name === "ECDSA") {
            const ecSigValue = AsnConvert.parse(signature, ECDSASigValue);
            const namedCurve = algorithm.namedCurve;
            const pointSize = AsnEcSignatureFormatter.namedCurveSize.get(namedCurve) || AsnEcSignatureFormatter.defaultNamedCurveSize;
            const r = this.addPadding(pointSize, this.removePadding(ecSigValue.r));
            const s = this.addPadding(pointSize, this.removePadding(ecSigValue.s));
            return combine(r, s);
        }
        return null;
    }
}
AsnEcSignatureFormatter.namedCurveSize = new Map();
AsnEcSignatureFormatter.defaultNamedCurveSize = 32;

const idX25519 = "1.3.101.110";
const idX448 = "1.3.101.111";
const idEd25519 = "1.3.101.112";
const idEd448 = "1.3.101.113";
let EdAlgorithm = class EdAlgorithm {
    toAsnAlgorithm(alg) {
        let algorithm = null;
        switch (alg.name.toLowerCase()) {
            case "eddsa":
                switch (alg.namedCurve.toLowerCase()) {
                    case "ed25519":
                        algorithm = idEd25519;
                        break;
                    case "ed448":
                        algorithm = idEd448;
                        break;
                }
                break;
            case "ecdh-es":
                switch (alg.namedCurve.toLowerCase()) {
                    case "x25519":
                        algorithm = idX25519;
                        break;
                    case "x448":
                        algorithm = idX448;
                        break;
                }
        }
        if (algorithm) {
            return new AlgorithmIdentifier({
                algorithm,
            });
        }
        return null;
    }
    toWebAlgorithm(alg) {
        switch (alg.algorithm) {
            case idEd25519:
                return { name: "EdDSA", namedCurve: "Ed25519" };
            case idEd448:
                return { name: "EdDSA", namedCurve: "Ed448" };
            case idX25519:
                return { name: "ECDH-ES", namedCurve: "X25519" };
            case idX448:
                return { name: "ECDH-ES", namedCurve: "X448" };
        }
        return null;
    }
};
EdAlgorithm = __decorate([
    injectable()
], EdAlgorithm);
container.registerSingleton(diAlgorithm, EdAlgorithm);

class Pkcs10CertificateRequest extends PemData {
    constructor(param) {
        if (PemData.isAsnEncoded(param)) {
            super(param, CertificationRequest);
        }
        else {
            super(param);
        }
        this.tag = "CERTIFICATE REQUEST";
    }
    onInit(asn) {
        this.tbs = AsnConvert.serialize(asn.certificationRequestInfo);
        this.publicKey = new PublicKey(asn.certificationRequestInfo.subjectPKInfo);
        const algProv = container.resolve(diAlgorithmProvider);
        this.signatureAlgorithm = algProv.toWebAlgorithm(asn.signatureAlgorithm);
        this.signature = asn.signature;
        this.attributes = asn.certificationRequestInfo.attributes
            .map(o => AttributeFactory.create(AsnConvert.serialize(o)));
        const extensions = this.getAttribute(id_pkcs9_at_extensionRequest);
        this.extensions = [];
        if (extensions instanceof ExtensionsAttribute) {
            this.extensions = extensions.items;
        }
        this.subject = new Name(asn.certificationRequestInfo.subject).toString();
    }
    getAttribute(type) {
        for (const attr of this.attributes) {
            if (attr.type === type) {
                return attr;
            }
        }
        return null;
    }
    getAttributes(type) {
        return this.attributes.filter(o => o.type === type);
    }
    getExtension(type) {
        for (const ext of this.extensions) {
            if (ext.type === type) {
                return ext;
            }
        }
        return null;
    }
    getExtensions(type) {
        return this.extensions.filter(o => o.type === type);
    }
    async verify(crypto = cryptoProvider.get()) {
        const algorithm = { ...this.publicKey.algorithm, ...this.signatureAlgorithm };
        const publicKey = await this.publicKey.export(algorithm, ["verify"], crypto);
        const signatureFormatters = container.resolveAll(diAsnSignatureFormatter).reverse();
        let signature = null;
        for (const signatureFormatter of signatureFormatters) {
            signature = signatureFormatter.toWebSignature(algorithm, this.signature);
            if (signature) {
                break;
            }
        }
        if (!signature) {
            throw Error("Cannot convert WebCrypto signature value to ASN.1 format");
        }
        const ok = await crypto.subtle.verify(this.signatureAlgorithm, publicKey, signature, this.tbs);
        return ok;
    }
}

class Pkcs10CertificateRequestGenerator {
    static async create(params, crypto = cryptoProvider.get()) {
        const spki = await crypto.subtle.exportKey("spki", params.keys.publicKey);
        const asnReq = new CertificationRequest({
            certificationRequestInfo: new CertificationRequestInfo({
                subjectPKInfo: AsnConvert.parse(spki, SubjectPublicKeyInfo),
            }),
        });
        if (params.name) {
            asnReq.certificationRequestInfo.subject = AsnConvert.parse(new Name(params.name).toArrayBuffer(), Name$1);
        }
        if (params.attributes) {
            for (const o of params.attributes) {
                asnReq.certificationRequestInfo.attributes.push(AsnConvert.parse(o.rawData, Attribute$1));
            }
        }
        if (params.extensions && params.extensions.length) {
            const attr = new Attribute$1({ type: id_pkcs9_at_extensionRequest });
            const extensions = new Extensions();
            for (const o of params.extensions) {
                extensions.push(AsnConvert.parse(o.rawData, Extension$1));
            }
            attr.values.push(AsnConvert.serialize(extensions));
            asnReq.certificationRequestInfo.attributes.push(attr);
        }
        const signingAlgorithm = { ...params.signingAlgorithm, ...params.keys.privateKey.algorithm };
        const algProv = container.resolve(diAlgorithmProvider);
        asnReq.signatureAlgorithm = algProv.toAsnAlgorithm(signingAlgorithm);
        const tbs = AsnConvert.serialize(asnReq.certificationRequestInfo);
        const signature = await crypto.subtle.sign(signingAlgorithm, params.keys.privateKey, tbs);
        const signatureFormatters = container.resolveAll(diAsnSignatureFormatter).reverse();
        let asnSignature = null;
        for (const signatureFormatter of signatureFormatters) {
            asnSignature = signatureFormatter.toAsnSignature(signingAlgorithm, signature);
            if (asnSignature) {
                break;
            }
        }
        if (!asnSignature) {
            throw Error("Cannot convert WebCrypto signature value to ASN.1 format");
        }
        asnReq.signature = asnSignature;
        return new Pkcs10CertificateRequest(AsnConvert.serialize(asnReq));
    }
}

class X509Certificates extends Array {
    constructor(param) {
        super();
        if (PemData.isAsnEncoded(param)) {
            this.import(param);
        }
        else if (param instanceof X509Certificate) {
            this.push(param);
        }
        else if (Array.isArray(param)) {
            for (const item of param) {
                this.push(item);
            }
        }
    }
    export(format) {
        const signedData = new asn1Cms.SignedData();
        signedData.certificates = new asn1Cms.CertificateSet(this.map(o => new asn1Cms.CertificateChoices({
            certificate: AsnConvert.parse(o.rawData, Certificate)
        })));
        const cms = new asn1Cms.ContentInfo({
            contentType: asn1Cms.id_signedData,
            content: AsnConvert.serialize(signedData),
        });
        const raw = AsnConvert.serialize(cms);
        if (format === "raw") {
            return raw;
        }
        return this.toString(format);
    }
    import(data) {
        const raw = PemData.toArrayBuffer(data);
        const cms = AsnConvert.parse(raw, asn1Cms.ContentInfo);
        if (cms.contentType !== asn1Cms.id_signedData) {
            throw new TypeError("Cannot parse CMS package. Incoming data is not a SignedData object.");
        }
        const signedData = AsnConvert.parse(cms.content, asn1Cms.SignedData);
        this.clear();
        for (const item of signedData.certificates || []) {
            if (item.certificate) {
                this.push(new X509Certificate(item.certificate));
            }
        }
    }
    clear() {
        while (this.pop()) {
        }
    }
    toString(format = "pem") {
        const raw = this.export("raw");
        switch (format) {
            case "pem":
                return PemConverter.encode(raw, "CMS");
            case "hex":
                return Convert.ToHex(raw);
            case "base64":
                return Convert.ToBase64(raw);
            case "base64url":
                return Convert.ToBase64Url(raw);
            default:
                throw TypeError("Argument 'format' is unsupported value");
        }
    }
}

class X509ChainBuilder {
    constructor(params = {}) {
        this.certificates = [];
        if (params.certificates) {
            this.certificates = params.certificates;
        }
    }
    async build(cert) {
        const chain = new X509Certificates(cert);
        let current = cert;
        while (current = await this.findIssuer(current)) {
            const thumbprint = await current.getThumbprint();
            for (const item of chain) {
                const thumbprint2 = await item.getThumbprint();
                if (isEqual(thumbprint, thumbprint2)) {
                    throw new Error("Cannot build a certificate chain. Circular dependency.");
                }
            }
            chain.push(current);
        }
        return chain;
    }
    async findIssuer(cert) {
        if (!await cert.isSelfSigned()) {
            const akiExt = cert.getExtension(asn1X509.id_ce_authorityKeyIdentifier);
            for (const item of this.certificates) {
                if (item.subject !== cert.issuer) {
                    continue;
                }
                if (akiExt) {
                    if (akiExt.keyId) {
                        const skiExt = item.getExtension(asn1X509.id_ce_subjectKeyIdentifier);
                        if (skiExt && skiExt.keyId !== akiExt.keyId) {
                            continue;
                        }
                    }
                    else if (akiExt.certId) {
                        const sanExt = item.getExtension(asn1X509.id_ce_subjectAltName);
                        if (sanExt &&
                            !(akiExt.certId.serialNumber === item.serialNumber && isEqual(AsnConvert.serialize(akiExt.certId.name), AsnConvert.serialize(sanExt)))) {
                            continue;
                        }
                    }
                }
                if (!await cert.verify({
                    publicKey: await item.publicKey.export(),
                    signatureOnly: true,
                })) {
                    continue;
                }
                return item;
            }
        }
        return null;
    }
}

class X509CertificateGenerator {
    static async createSelfSigned(params, crypto = cryptoProvider.get()) {
        return this.create({
            serialNumber: params.serialNumber,
            subject: params.name,
            issuer: params.name,
            notBefore: params.notBefore,
            notAfter: params.notAfter,
            publicKey: params.keys.publicKey,
            signingKey: params.keys.privateKey,
            signingAlgorithm: params.signingAlgorithm,
            extensions: params.extensions,
        }, crypto);
    }
    static async create(params, crypto = cryptoProvider.get()) {
        var _a;
        const spki = await crypto.subtle.exportKey("spki", params.publicKey);
        const asnX509 = new asn1X509.Certificate({
            tbsCertificate: new asn1X509.TBSCertificate({
                version: asn1X509.Version.v3,
                serialNumber: Convert.FromHex(params.serialNumber),
                validity: new asn1X509.Validity({
                    notBefore: params.notBefore,
                    notAfter: params.notAfter,
                }),
                extensions: new asn1X509.Extensions(((_a = params.extensions) === null || _a === void 0 ? void 0 : _a.map(o => AsnConvert.parse(o.rawData, asn1X509.Extension))) || []),
                subjectPublicKeyInfo: AsnConvert.parse(spki, asn1X509.SubjectPublicKeyInfo),
            }),
        });
        if (params.subject) {
            asnX509.tbsCertificate.subject = AsnConvert.parse(new Name(params.subject).toArrayBuffer(), asn1X509.Name);
        }
        if (params.issuer) {
            asnX509.tbsCertificate.issuer = AsnConvert.parse(new Name(params.issuer).toArrayBuffer(), asn1X509.Name);
        }
        const signingAlgorithm = { ...params.signingAlgorithm, ...params.signingKey.algorithm };
        const algProv = container.resolve(diAlgorithmProvider);
        asnX509.tbsCertificate.signature = asnX509.signatureAlgorithm = algProv.toAsnAlgorithm(signingAlgorithm);
        const tbs = AsnConvert.serialize(asnX509.tbsCertificate);
        const signature = await crypto.subtle.sign(signingAlgorithm, params.signingKey, tbs);
        const signatureFormatters = container.resolveAll(diAsnSignatureFormatter).reverse();
        let asnSignature = null;
        for (const signatureFormatter of signatureFormatters) {
            asnSignature = signatureFormatter.toAsnSignature(signingAlgorithm, signature);
            if (asnSignature) {
                break;
            }
        }
        if (!asnSignature) {
            throw Error("Cannot convert ASN.1 signature value to WebCrypto format");
        }
        asnX509.signatureValue = asnSignature;
        return new X509Certificate(AsnConvert.serialize(asnX509));
    }
}

ExtensionFactory.register(asn1X509.id_ce_basicConstraints, BasicConstraintsExtension);
ExtensionFactory.register(asn1X509.id_ce_extKeyUsage, ExtendedKeyUsageExtension);
ExtensionFactory.register(asn1X509.id_ce_keyUsage, KeyUsagesExtension);
ExtensionFactory.register(asn1X509.id_ce_subjectKeyIdentifier, SubjectKeyIdentifierExtension);
ExtensionFactory.register(asn1X509.id_ce_authorityKeyIdentifier, AuthorityKeyIdentifierExtension);
ExtensionFactory.register(asn1X509.id_ce_subjectAltName, SubjectAlternativeNameExtension);
AttributeFactory.register(asnPkcs9.id_pkcs9_at_challengePassword, ChallengePasswordAttribute);
AttributeFactory.register(asnPkcs9.id_pkcs9_at_extensionRequest, ExtensionsAttribute);
container.registerSingleton(diAsnSignatureFormatter, AsnDefaultSignatureFormatter);
container.registerSingleton(diAsnSignatureFormatter, AsnEcSignatureFormatter);
AsnEcSignatureFormatter.namedCurveSize.set("P-256", 32);
AsnEcSignatureFormatter.namedCurveSize.set("K-256", 32);
AsnEcSignatureFormatter.namedCurveSize.set("P-384", 48);
AsnEcSignatureFormatter.namedCurveSize.set("P-521", 66);

export { AlgorithmProvider, AsnData, AsnDefaultSignatureFormatter, AsnEcSignatureFormatter, Attribute, AttributeFactory, AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ChallengePasswordAttribute, CryptoProvider, EcAlgorithm, EdAlgorithm, ExtendedKeyUsageExtension, Extension, ExtensionFactory, ExtensionsAttribute, KeyUsageFlags, KeyUsagesExtension, Name, NameIdentifier, OtherName, PemConverter, Pkcs10CertificateRequest, Pkcs10CertificateRequestGenerator, PublicKey, RsaAlgorithm, SubjectAlternativeNameExtension, SubjectKeyIdentifierExtension, X509Certificate, X509CertificateGenerator, X509Certificates, X509ChainBuilder, cryptoProvider, diAlgorithm, diAlgorithmProvider, diAsnSignatureFormatter, idEd25519, idEd448, idX25519, idX448 };
