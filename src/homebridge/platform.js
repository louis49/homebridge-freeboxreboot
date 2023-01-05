export const PLATFORM_NAME = 'HomebridgeFreeboxReboot';
export const PLUGIN_NAME = 'homebridge-freeboxreboot';
import axios from "axios";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import cron from "node-cron";

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

class FreeboxReboot {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.config_path = path.join(api.user.storagePath(), 'freeboxreboot-config.json');

        api.on("didFinishLaunching" , async () => {
            this.log.info("didFinishLaunching");

            this.load();

            if(!this.app_token){
                let data = await this.request_auth();
                let auth = {};
                let status = "pending";
                while (status === "pending"){
                    auth = await this.get_auth(data.track_id);
                    status = auth.status;
                    console.log(auth.status);
                    await sleep(1000);
                }

                this.app_token = data.app_token;
                this.save();
            }

            cron.schedule('*/1 * * * *', async () => {
                console.log('Am i online ?');

                let login = await this.login();
                let hmac = crypto.createHmac('sha1', this.app_token);
                hmac.update(login.challenge);
                let password = hmac.digest('hex');
                let session = (await this.session(password));

                let online = await this.check();

                if(!online){
                    console.log("No, Rebooting !");
                    await this.reboot(session.session_token);
                }
                else{
                    console.log("Yes, I'm online");
                }
            });

            this.log.info("end didFinishLaunching");
        });
    }

    load() {
        if(fs.existsSync(this.config_path)){
            let data = fs.readFileSync(this.config_path, {encoding:'utf-8'});
            if(data){
                let obj = JSON.parse(data);
                this.app_token = obj.app_token;
            }
        }

        this.log.info("App Token loaded");
    }

    save() {
        let obj = {
            app_token:this.app_token
        }
        let data = JSON.stringify(obj, null, 1);
        fs.writeFileSync(this.config_path, data, {encoding:'utf-8'});
        this.log.info("App Token saved");
    }

    async request_auth() {
        let ret = await axios.post("http://mafreebox.freebox.fr/api/v4/login/authorize/", {
            "app_id": this.config.app_id,
            "app_name": this.config.app_name,
            "app_version": this.config.app_version,
            "device_name": this.config.device_name
        });
        return ret.data.result;
    }

    async get_auth(track_id) {
        let ret = await axios.get("http://mafreebox.freebox.fr/api/v4/login/authorize/"+track_id);
        return ret.data.result;
    }

    async login() {
        let ret = await axios.get("http://mafreebox.freebox.fr/api/v4/login");
        return ret.data.result;
    }

    async session(password) {
        let ret = await axios.post("http://mafreebox.freebox.fr/api/v4/login/session/", {
            "app_id": this.config.app_id,
            "app_version": this.config.app_version,
            "password": password
        });
        return ret.data.result;
    }

    async reboot(session_token){
        let ret = await axios.post("http://mafreebox.freebox.fr/api/v4/system/reboot", {}, {
            headers: {
                'X-Fbx-App-Auth': session_token
            }
        });
        return ret.data.result;
    }

    async check(){
        let ret = await axios.get('https://www.google.com').catch((error) => {});

        if(ret){
            return (ret.status === 200);
        }
        else{
            return false;
        }
    }
}



export { FreeboxReboot };
