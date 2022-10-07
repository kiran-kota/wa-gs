if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
// const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SB_URL, process.env.SB_API);

const axios = require('axios');
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 80;
const ip = process.env.IP || '0.0.0.0';
const tb = process.env.TABLE;

// app.use(express.static(__dirname + '/'));

// app.engine('html', require('ejs').renderFile);
// app.set('view engine', 'html');
// app.set('views', __dirname);
// app.use(cors());
// app.use(express.static(path.join(__dirname, 'www')));


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
app.use(cors());
const path = __dirname + '/www/';

app.use(express.static(path));
app.get('/', function (req,res) {
    res.sendFile(path + "index.html");
  });

async function createContainer(id){
    try {
        await axios.post(`http://${ip}:5555/containers/create?name=${id}`, {"Image":"my-app", "ExposedPorts":{"80/tcp":{}},"HostConfig":{"PortBindings":{"80/tcp":[{"HostPort":""}]}}});
        await startContainer(id);      
    } catch (error) {
        console.log(error, 'creation error');
    }
}

async function startContainer(id){
    try {
        await axios.post(`http://${ip}:5555/containers/${id}/start`);        
    } catch (error) {
        console.log(error, 'start error');
    }
}

async function checkContainer(id){
    try {
       const result = await axios.get(`http://${ip}:5555/containers/${id}/json`);  
       if(result.data.State.Status == 'exited'){
            await startContainer(id);
       }     
       return result.data;
    } catch (error) {
       createContainer(id);
       return null;
    }
}

app.post('/register', async (req, res)=>{
    try {
        var doc = await supabase.from(tb).select('*').eq('sheet_id', req.body.sheet_id).single();
        const result = doc.data;
        if(result == null || result == undefined){
            let sheet = {sheet_id: req.body.sheet_id, email: req.body.email};
            await supabase.from(tb).insert([sheet]).single();            
        }
        checkContainer(req.body.sheet_id);
        res.status(200).json({status: true});
    } catch (error) {
        res.json({status: false, error: error});
    }   
});

app.get('/get-list/:id', async(req, res)=>{
    try {
        const id = req.params.id;
        const result = await checkContainer(id);
        const p = result.NetworkSettings.Ports['80/tcp'][0].HostPort;
        let url = `http://${ip}:${p}`;
        const response = await axios.get(`${url}/sessions/list`);
        console.log(response.data, 'sessions');
        var list = [];
        for(var s of response.data.data){
            var r = await axios.get(`${url}/sessions/status/${s.name}`);            
            if(r.data.success){
                list.push({name: s.name, status: r.data.data.status});
            }
        }

        const {data, error} = await supabase.from(tb).select('*').eq('sheet_id', id).single();
        res.json({status: true, data: list, sheet: data});        
    } catch (error) {
       res.json({status: false, message: error});
    }
});

app.get('/get-status/:id/:name', async (req, res) => {
    try {
        const id = req.params.id;
        const name = req.params.name;
        const result = await checkContainer(id);
        const p = result.NetworkSettings.Ports['80/tcp'][0].HostPort;
        let url = `http://${ip}:${p}`;
        const response = await axios.get(`${url}/sessions/status/${name}`);
        res.json(response.data);
    } catch (error) {
       res.json({status: false, message: error});
    }
});

app.get('/get-qr/:id/:name', async (req, res) => {
    try {
        const id = req.params.id;
        const name = req.params.name;
        const result = await checkContainer(id);
        const p = result.NetworkSettings.Ports['80/tcp'][0].HostPort;
        let url = `http://${ip}:${p}`;
        const response = await axios.post(`${url}/sessions/add`, { 'id': name, 'isLegacy': false });
        res.json(response.data);
    } catch (error) {
       res.json({status: false, message: error});
    }
});

app.get('/disconnect/:id/:name', async (req, res) => {
    try {
        const id = req.params.id;
        const name = req.params.name;
        const result = await checkContainer(id);
        const p = result.NetworkSettings.Ports['80/tcp'][0].HostPort;
        let url = `http://${ip}:${p}`;
        const response = await axios.delete(`${url}/sessions/delete/${name}`);
        res.json(response.data);
    } catch (error) {
       res.json({status: false, message: error});
    }
});

app.post('/send-message/:id', async (req, res)=>{
    try {
        const id = req.params.id;
        const name = req.body.name;
        const msg = req.body.msg;
        console.log(id, name, msg);
        const result = await checkContainer(id);
        const p = result.NetworkSettings.Ports['80/tcp'][0].HostPort;
        let url = `http://${ip}:${p}`;
        console.log(url);
        const response = await axios.post(`${url}/chats/send?id=${name}`, msg);   
        console.log(response.data);
        if(response.data.success){
            try {
                var doc = await supabase.from(tb).select('*').eq('sheet_id', id).single();
                console.log(doc.data);
                if(doc.data){
                    var i = doc.data.sent + 1;
                    console.log(i, 'i');
                    const {data, error} = await supabase.from(tb).update({sent: i}).match({sheet_id : id});
                    console.log(data, error);
                }
            } catch (err) {
                console.log(err, 'sent incr error');
            }
        }
        res.json(response.data);
    } catch (error) {
        console.log(error, 'error');
       res.json({success: false, message: error});
    }
});


app.listen(port, function () {
    console.log('App running on *: ' + port);
});
