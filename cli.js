const gpc = require(".");
const fs = require("fs");
const readline = require("readline");
const {createHash} = require("crypto");

const interface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
interface.pause();

const args = require("yargs")
    .scriptName("gpc")
    .command("install <package>","Install a package and it's depedencies", function(yargs){return yargs.option("only-download",{alias:"d",type:"boolean",default:false,description:"If set, will download packages, but will not take any install action"})})
    .command("upgrade <package>","Upgrade a package and it's depedencies", function(yargs){return yargs.option("only-download",{alias:"d",type:"boolean",default:false,description:"If set, will download packages, but will not take any install action"})})
    .command("info <package>","Get package information (such as dependencies, latest version, etc)")
    .command("upgrade-all","Upgrade all packages to the latest version")
    .command("remove <package>","Remove a package")
    .command("auto-remove","Remove all orphan packages")
    .demandCommand(0,"Need action")
    .version("version","Display version information","GPC 0.0.1")
    .alias("v","version")
    .showVersion()
    .example("$0 install nyancat","Download and install a package and its depedencies")
    .example("$0 install -d nyancat","Only download a package and its depedencies")
    .example("$0 upgrade nyancat","Download and upgrade a package and its depedencies")
    .example("$0 upgrade -d nyancat","Only download a package that need to be upgraded")
    .example("$0 info nyancat","Fetch information about a package")
    .example("$0 remove nyancat","Remove a package")
    .example("$0 auto-remove","Remove orphan packages")
    .argv;
const command = args._[0];
const host = "localhost";
const port = 400;
const tls = false;
console.log(`Connecting to gpc${tls ? "s" : ""}://${host}:${port}`);
const client = new gpc({host, port, tls});
async function makeDepTree(packInfo, alreadyVisitedObj){
    const alreadyVisited = alreadyVisitedObj || {};
    const dep = {};
    const info = await client.getPackageInformation(packInfo.name, packInfo.platform, packInfo.version);
    dep.name = info.name;
    dep.platform = info.platform;
    dep.version = info.version;
    dep.size = info.size;
    dep.dependencies = [];
    alreadyVisited[dep.name+"_"+dep.version+"_"+dep.platform] = true;
    for(const dep_packInfo of info.dependencies){
        if(!dep_packInfo.name) continue;
        if(alreadyVisited[dep_packInfo.name+"_"+dep_packInfo.version+"_"+dep_packInfo.platform]) continue;
        const dep_dep = await makeDepTree(dep_packInfo, alreadyVisited);
        dep.dependencies.push(dep_dep);
    }
    return dep;
}
function depArr(dep){
    const dep_arr = [];
    dep_arr.push(dep);
    for(const dependency of dep.dependencies){
        depArr(dependency).forEach(d => dep_arr.push(d));
    }
    return dep_arr;
}
const wait = ms => new Promise(r => setTimeout(r,ms));
async function downloadDeps(dep,dir){
    process.stdout.write(`Downloading ${dep.name}@${dep.version}...`);
    const {content, checksum} = await client.download(dep.name, dep.platform, dep.version, dep.size);
    const checksum2check = createHash("sha256").update(content).digest();
    if(checksum.toString("base64") !== checksum2check.toString("base64")){
        console.error(" ERR!");
        console.error("Checksums doesnt match!");
        process.exit(1);
    }
    fs.writeFileSync(`${dir}/${dep.name}_${dep.version}_${dep.platform}`, content);
    console.log(" OK");
    for(const dep_dep of dep.dependencies){
        await downloadDeps(dep_dep,dir);
    }
}
if(command == "install"){
    const [package, version] = args.package.split("@");
    process.stdout.write(`Building package dependency tree for ${package}${version ? "@"+version: ""}...`);
    makeDepTree({name: package, platform: process.arch == "x64" ? "amd64" : process.arch, version}).then(pack => {
        console.log(" OK");
        const depArray = depArr(pack);
        depArray.forEach(d => process.stdout.write(`${d.name}_${d.version}_${d.platform} `));
        console.log();
        console.log(`This action will install ${depArray.length} packages`);
        interface.resume();
        interface.question("You want to continue [Y/n]: ", async answer => {
            interface.pause();
            if(answer.toLowerCase() == "y"){
                const tmp = fs.mkdtempSync("gpc-downloads-");
                await downloadDeps(pack, tmp);
            }
        });
    });
}else if(command == "upgrade"){

}else if(command == "info"){
    const [package, version] = args.package.split("@");
    client.getPackageInformation(package,process.arch == "x64" ? "amd64" : process.arch,version).then(package => {
        //makeDepTree(package).then(p => console.log(p));
        console.log(`Name: ${package.name}\n${version ? "V" : "Latest v"}ersion: ${package.version}\nSize: ${package.size/1024}kb\nDependencies: ${package.dependencies.map(d => d.name+"_"+d.version+"_"+d.platform).join(" ")}`);
    }).catch(err => console.error(err.message));
}else if(command == "remove"){

}else if(command == "auto-remove"){

}