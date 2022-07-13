const net = require("net");
const tls = require("tls");
function checkArg(arg, type){
    if(arg !== undefined && arg !== null){
        if(!(arg.constructor == type)) 
            throw new TypeError(`Arg ${type} != ${arg}.constructor`);
    }else throw new TypeError(`Arg ${arg} === undefined`);
}
const wait = ms => new Promise(r => setTimeout(r,ms));

class GPCOptions{
    /**
     * Will use TLS over TCP.
     * @type {Boolean}
     */
    tls = true
}
class InfoPackage{
    /**
     * The package name
     * @type {string}
     */
    name
    /**
     * The version of the package
     * @type {string}
     */
    version
    /**
     * The platform
     * @type {string}
     */
    platform
}
class Package{
    /**
     * The package name
     * @type {string}
     */
    name
    /**
     * The version of the package
     * @type {string}
     */
    version
    /**
     * The platform
     * @type {string}
     */
    platform
    /**
     * The size in bytes of the packagetttf
     * @type {int}
     */
    size
    /**
     * @type {InfoPackage[]}
     */
    dependencies
}
class GPCClient{
    /**
     * @type {net.Socket | tls.TLSSocket}
     */
    #tcpConnection
    /**
     * 
     * @param {net.NetConnectOpts | GPCOptions} options 
     */
    constructor(options){
        if(options.tls === undefined) options.tls = true;
        if(options.tls)
            this.#tcpConnection = tls.connect(options).unref();
        else
            this.#tcpConnection = net.createConnection(options).unref();
        this.#tcpConnection.pause(); // fuck data event
    }
    /**
     * @returns {Promise<int>}
     */
    async #read1byte(){
        let buf;
        while(!buf){
            buf = this.#tcpConnection.read(1);
            await wait(0);
        }
        return buf[0];
    }
    /**
     * @returns {Promise<Buffer>}
     */
    async #read4byte(){
        let buf;
        while(!buf){
            buf = this.#tcpConnection.read(4);
            await wait(0);
        }
        return buf;
    }
    async #ondata(size){
        let buf;
        while(!buf){buf = this.#tcpConnection.read(size);await wait(0);}
        return buf;
    }
    async #readMessageUntilNull(){
        let buf = "";
        while(true){
            const value = this.#tcpConnection.read(1);
            if(value){
                const char = value[0];
                if(char === 0) break;
                buf += String.fromCharCode(char);
            }else await wait(0);
        }
        return buf;
    }
    
    /**
     * 
     * @param {String} package Package name
     * @param {String} platform Package platform
     * @param {String | undefined} version
     * @returns {Promise<Package>}
     */
    async getPackageInformation(packageName, platform, version){
        checkArg(packageName, String);
        checkArg(platform, String);
        if(version) checkArg(version, String);
        this.#tcpConnection.write(`\x00${packageName}\x00${platform}\x00${version ? version+"\x00" : ""}`);
        const nosuccess = await this.#read1byte();
        if(nosuccess)
            throw new Error(await this.#readMessageUntilNull());
        const packageNameInServer = await this.#readMessageUntilNull();
        const platformInServer = await this.#readMessageUntilNull();
        const versionInServer = await this.#readMessageUntilNull();
        const size = (await this.#read4byte()).readUintBE(0,4);

        const dependenciesSize = await this.#read1byte();
        const dependencies = [];
        for(let i=0;i<dependenciesSize;i++){
            const dep = {};
            dep.name = await this.#readMessageUntilNull();
            dep.platform = await this.#readMessageUntilNull();
            dep.version = await this.#readMessageUntilNull();
            dependencies.push(dep);
        }

        return {name: packageNameInServer, platform: platformInServer, version: versionInServer, size, dependencies};
    }
    /**
     * 
     * @param {String} packageName Package name
     * @param {String} platform Package platform
     * @param {String} version Package version
     * @returns {Promise<Buffer>}
     */
    async download(packageName, platform, version, size){
        checkArg(packageName, String);
        checkArg(platform, String);
        checkArg(version, String);
        this.#tcpConnection.write(`\x01${packageName}\x00${platform}\x00${version}\x00`);
        const nosuccess = await this.#read1byte();
        if(nosuccess)
            throw new Error(await this.#readMessageUntilNull());
        return await this.#ondata(size);
    }
}

module.exports = GPCClient;