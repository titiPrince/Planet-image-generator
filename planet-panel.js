
// Côté serveur du panel


const {PlanetImage} = require("./planets.js");

const express = require('express');
const fs = require('fs');

const app = express();

app.set('view engine', 'ejs');

app.use(express.json());
app.use(express.static(__dirname + '/test/'));


var ips = ["::1", "::ffff:127.0.0.1", "::ffff:192.168.1.38"]; // ip filter

app.get("/image/:file", (request, response) => {
  console.log(request.socket.remoteAddress);

  // if (!ips.includes(request.socket.remoteAddress)) return;

  let file = request.params.file

  response.sendFile(__dirname + "/Renders/" + file);
});

app.get("/planet/create", (request, response) => {
  console.log(request.socket.remoteAddress);
  // if (!ips.includes(request.socket.remoteAddress)) return;

  let planetType = ["", "", "", "", "", "", "", "", "", ""];
  let algo = {
    perlin: {
      params: {
        octave: false
      }
    }
  }

  // @TODO: Useless, need to be removed (+ edit ejs file)
  let genTimes = {
    initialisationTime: 0.0,
    initialisationAlgorithmTime: 0.0,
    initialisationGradientsTime: 0.0,
    initialisationEmptyImageTime: 0.0,
    initialisationOthersTime: 0.0,

    imageGenerationTime: 0.0,
    planetGenerationTime: 0.0,
    planetNoiseAlgorithmTime: 0.0,
    planetGradientSelectionTime: 0.0,
    planetAntiAliasingTime: 0.0,
    
    atmosphereGenerationTime: 0.0,
    atmosphereGradientSelectionTime: 0.0,
    atmospherePixelAdditionTime: 0.0,
    
    cloudGenerationTime: 0.0,
    cloudNoiseAlgorithmTime: 0.0,
    cloudPixelAdditionTime: 0.0,
    
    ringGenerationTime: 0.0,
    ringEllipseCalculationTime: 0.0,
    ringAntiAliasingTime: 0.0,
    ringNoiseAlgorithmTime: 0.0,
    ringPixelAdditionTime: 0.0,
    
    imageWriting: 0.0,

    totale: 0.0
  };

  response.render('create', {
    algo: algo,
    hasRing: false,
    genTimes: genTimes
  });
});

app.post("/planet/generate", (request, response) => {
  let data = request.body;

  let configs = {
    hasRing: data.hasRing,
    hasAthmosphere: data.hasAthmosphere,
    hasClouds: data.hasClouds,
    atmosphereBorderWidthOuter: Number(data.atmosphereBorderWidthOuter),
    atmosphereBorderWidthInner: Number(data.atmosphereBorderWidthInner),
    planetColors: data.planetColors,
    athmosphereColors: data.athmosphereColors,
    planetAlgorithmOctave: data.planetAlgorithmOctave,
    planetAlgorithmOctaveQuantity: data.planetAlgorithmOctaveQuantity,
    planetAlgorithmOctaveExponent: Number(data.planetAlgorithmOctaveExponent),
    planetAlgorithmWorleyCellNbr: Number(data.planetAlgorithmWorleyCellNbr),
    planetAlgorithm: data.planetAlgorithm
  };

  let image = new PlanetImage();

  image.create("Renders/render.png", function (imageFile, genTimes) {
    response.json(
      {
        file: imageFile, 
        times: genTimes
      }
    );
  }, configs);
});

app.post("/planet/save", (request, response) => {
  let data = request.body;

  let configs = {
    hasRing: data.hasRing,
    hasAthmosphere: data.hasAthmosphere,
    hasClouds: data.hasClouds,
    atmosphereBorderWidthOuter: Number(data.atmosphereBorderWidthOuter),
    atmosphereBorderWidthInner: Number(data.atmosphereBorderWidthInner),
    planetColors: data.planetColors,
    athmosphereColors: data.athmosphereColors,
    planetAlgorithmOctave: data.planetAlgorithmOctave,
    planetAlgorithmOctaveQuantity: data.planetAlgorithmOctaveQuantity,
    planetAlgorithmOctaveExponent: Number(data.planetAlgorithmOctaveExponent),
    planetAlgorithmWorleyCellNbr: Number(data.planetAlgorithmWorleyCellNbr),
    planetAlgorithm: data.planetAlgorithm
  };

  fs.writeFile("Saves/" + data.saveName + ".json", JSON.stringify(configs, null, 2), (error) => {response.sendStatus(200);});
});

app.get("/planet/load", (request, response) => {
  let reqData = request.query;

  try {
    let planetData = require("./Saves/" + reqData.loadName + ".json");
    response.send(planetData);
  } catch (error) {
    response.sendStatus(500);
  }
});

app.listen(80, Listening());

function Listening() {
  console.log("Server listening on port 80");
}