import { totalist } from "totalist";
import * as fs from "fs-extra";

async function getJSONs(root = "src", regex = /function\.json$/) {
  return new Promise(async (resolve: (value: string[]) => void) => {
    let JSONs: string[] = [];

    await totalist(root, (name, abs, stats) => {
      if (regex.test(name)) {
        JSONs.push(abs);
      }
    });
    resolve(JSONs);
  });
}

async function extractEndpoints() {
  const JSONs = await getJSONs();
  const fullValues = JSONs.map((path) => {
    // Read File
    console.log(path);
    const json = fs.readJsonSync(path);
    // Calculate Absolute Path
    const splitPath = (json.scriptFile as string).split("./");
    const count = splitPath.reduce((total, path) => {
      return (total += path === "." ? 1 : 0);
    }, 0);
    const _path = splitPath.reduce((prev, subpath) => {
      if (subpath === ".") return prev;
      if (subpath === "") return prev;
      else return prev + subpath;
    }, "");
    let parentPathArr = path.split("/");
    parentPathArr.pop();
    const parent = parentPathArr.join("/");
    for (let index = 0; index < count; index++) {
      parentPathArr.pop();
    }
    parentPathArr.push(_path);
    const fullPath = parentPathArr.join("/");
    // Return Relative and Absolute paths
    return {
      path,
      fullPath,
      parent,
      json,
    };
  });
  return fullValues;
}

async function createAzureFunctionStructure(
  endpointList: {
    path: string;
    fullPath: string;
    parent: string;
    json: any;
  }[]
) {
  // console.log(fs.readdirSync("./dist"));
  if (fs.pathExistsSync("./dist")) {
    // console.log(fs.lstatSync("./dist"));
    fs.rmdirSync("./dist", {
      recursive: true,
    });
  }
  fs.mkdirSync("./dist");
  endpointList.forEach(async (endpt) => {
    const endPath = "./dist/".concat(
      endpt.parent.split("/")[endpt.parent.split("/").length - 1]
    );
    fs.mkdirSync(endPath);
    console.log(endpt.path);
    const json = fs.readJSONSync(endpt.path);
    const newPath = endPath
      .replace(process.cwd(), "./")
      .concat("/", "function.json");
    const newJSON = {
      ...json,
      scriptFile: endpt.fullPath
        .replace(process.cwd(), "../..")
        .replace("src", "build")
        .replace(".ts", ".js"),
    };

    fs.writeJsonSync(newPath, newJSON, {
      spaces: "\t",
    });
    // fs.copyFileSync(endpt.path, endPath + "/function.json");
  });
}

async function copyLocalSettings() {
  fs.copyFileSync("./host.json", "./dist/host.json");
  fs.copyFileSync("./local.settings.json", "./dist/local.settings.json");
}

async function run() {
  const data = await extractEndpoints();
  createAzureFunctionStructure(data);
  copyLocalSettings();
}

run();
