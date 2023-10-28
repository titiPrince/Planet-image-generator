
// Ce script à été modifié pour fonctionner avec le panel
// La documentation n'est pas complète


const utils = require("../utils"); // gaussian random
const Jimp = require("jimp");
const { createNoise3D } = require('simplex-noise');
var Alea = require('alea');


class NoiseGenerator {
  static algorithm = {
    Simplex: 0,
    Worley: 1
  };

  constructor(config) {
    this.config = config || {};
    this.algo = config.algorithm || NoiseGenerator.algorithm.Simplex;
    this.seed = config.seed || Math.random();

    this._formatParameters = config.formatParametersCallback || function (x, y, z = 1) {return {x:x,y:y,z:z}};
  
    switch (this.algo) {
      default:
      case NoiseGenerator.algorithm.Simplex:
        this.simplexGetNoise = createNoise3D(Alea(this.seed));
        this._noise = function (x, y, z = 1) {
          return (this.simplexGetNoise(x, y, z) + 1) / 2;
        };
        break;

      case NoiseGenerator.algorithm.Worley:
        this.worleySize = this.config.worleySize || 100;
        let noise = new utils.WorleyNoise({numPoints: this.config.worleyNumPoints || 100});
        let worleyRenderImageCallback = this.config.worleyRenderImageCallback || function (e, m) { return e(1) - e(2); };

        this.worleyImage = noise.renderImage(this.worleySize + 10, {
          normalize: true,
          callback: worleyRenderImageCallback
        });

        this._noise = function (x, y, z = 1) {return this.worleyImage[Math.round(y * (this.worleySize+10) + x)]};
        break;
    }
  }

  getNoiseAt(x, y, z = 1) {
    let point = this._formatParameters(x, y, z);

    if (this.config.applyOctaves) {
      let amplitude = 0;
      let noise = 0
      let nbrFreqs = this.config.nbrFreqs || 5;
      let exp = this.config.octavesExponent || 1.5;

      for (let w = 0; w < nbrFreqs; w++) {
        let div = 2**w
        noise += (1/div) * this._noise(point.x*div, point.y*div, point.z*div);
        amplitude += (1/div);
      }

      noise /= amplitude;

      noise = Math.pow(noise, exp);
      
      return noise;
    }

    return this._noise(point.x, point.y, point.z);
  }
}

/**
 * Create the image of a planet
 */
class PlanetImage {
  constructor() {}

  /**
   * Get a distance between two points
   * @param {number} x Coordinate x
   * @param {number} y Coordinate y
   * @param {number} cx Center x
   * @param {number} cy Center y
   * @returns {number} The distance between [`x`,`y`] and [`cx`,`cy`]
   */
  #getDistance(x, y, cx, cy) {
    let distance = Math.sqrt(Math.pow(cx - x, 2) + Math.pow(cy - y, 2));

    return distance;
  }

  /**
   * Get the distance of the point depending of the ellipse parameters
   * @param {number} x Coordinate x
   * @param {number} y Coordinate y
   * @param {number} cx Center x
   * @param {number} cy Center y
   * @param {number} width Width of the ellipse
   * @param {number} height Height of the ellipse
   * @param {number} rotation The rotation in radians
   * @returns {Array<number, boolean>} Return firstly the distance [0.0, 1.0] 
   * and secondly a bool to know if the point [x,y] is in the first half part of the ellipse
   */
  #getDistanceEllipse(x, y, cx, cy, width, height, rotation) {
    let cosRotation = Math.cos(rotation);
    let sinRotation = Math.sin(rotation);
    let xRotation = (x - cx) * cosRotation - (y - cy) * sinRotation;
    let yRotation = (x - cx) * sinRotation + (y - cy) * cosRotation;

    let inFirstHalf = false;

    if (yRotation > 0) {
      inFirstHalf = true;
    }

    return [(xRotation ** 2) / (width ** 2) + (yRotation ** 2) / (height ** 2), inFirstHalf];
  }

  /**
   * Create a gradient between each color in the `colors` parameter
   * @param {Array} colors All the colors of the gradient
   * @param {number} steps The number of colors at the output
   * @returns {Array} An array with `steps` number of colors
   */
  #createGradient(colors, steps) {
    const gradient = [];

    for (let i = 0; i < steps - 1; i++) {
      const colorPosition = i / (steps - 1);
      const colorIndex = Math.floor(colorPosition * (colors.length - 1));
      const colorPercentage = colorPosition * (colors.length - 1) - colorIndex;

      const color1 = colors[colorIndex];
      const color2 = colors[colorIndex + 1];

      const color = {
        r: Math.round(color1.r + (color2.r - color1.r) * colorPercentage) / 255,
        g: Math.round(color1.g + (color2.g - color1.g) * colorPercentage) / 255,
        b: Math.round(color1.b + (color2.b - color1.b) * colorPercentage) / 255,
      };

      gradient.push(color);
    }

    return gradient;
  }

  /**
   * Select a color from the `gradient` array depending of `t`, if `t` = 0.0 the first color will be selected
   * if `t` = 1.0 the last color will be selected
   * @param {Array} gradient An array with colors, one color is a Dictionnary with `r`, `g`, `b` keys
   * @param {number} t A float value [0.0, 1.0], it will select two colors in the gradient and mix them
   * @returns {Array} A dictionary with `r`, `g`, `b` keys
   */
  #lerpGradient(gradient, t) {
    // Vérifie que t est compris entre 0 et 1
    t = Math.max(0, Math.min(1, t));

    // Calcule l'index de la couleur de départ dans le gradient
    var startIndex = Math.floor(t * (gradient.length - 1));

    // Calcule l'index de la couleur d'arrivée dans le gradient
    var endIndex = Math.ceil(t * (gradient.length - 1));

    // Calcule le coefficient de linéarité
    var lerp = (t * (gradient.length - 1)) % 1;

    // Applique le Lerp entre les deux couleurs
    var color = {
      r: gradient[startIndex].r + (gradient[endIndex].r - gradient[startIndex].r) * lerp,
      g: gradient[startIndex].g + (gradient[endIndex].g - gradient[startIndex].g) * lerp,
      b: gradient[startIndex].b + (gradient[endIndex].b - gradient[startIndex].b) * lerp
    };

    // Retourne la couleur interpolée
    return color;
  }

  /**
   * Create the image of the `planet` at the path of `filePath`
   * @param {string} filePath The final path of the image, must contain the file name and the file extension
   * @param {Array} imageSize A dictionary with `w` and `h` keys, its the image's resolution
   */
  create(filePath, callback, configs = null, imageSize = {w: 601, h: 401}) {
    var genTimes = {};

    console.time('total')
    utils.time("total");
    utils.time("init");

    this.configs = configs || {};

    // Parameters calculation
    const imageWidth = imageSize.w || 601;
    const imageHeight = imageSize.h || 401;

    // The percentage of space that the planet will take from the image. [0.0, 1.0]
    const MAX_PLANET_SIZE_PERCENT = 0.85;
    const MIN_PLANET_SIZE_PERCENT = 0.25;
    const CHANNEL_MAX_VALUE = 255;

    let imageMiddle = {
      x: Math.round(imageWidth / 2), 
      y: Math.round(imageHeight / 2)
    };


    // PLANET
    
    // Planet size to percentage
    let planetSizeRatio = MAX_PLANET_SIZE_PERCENT;

    let planetRadius = Math.round((imageHeight / 2) * planetSizeRatio);
    const planetAlpha = 1.0; // [0.0, 1.0]

    let planetPosition = {
      x: imageMiddle.x, 
      y: imageMiddle.y
    };

    // LIGHT

    // Les meilleurs paramètres pour la plus petite planète sont x: 0.98 et y: 0.98
    // tandis que pour la plus grande sont x: 0.85 et y: 0.85
    // donc il faut pouvoir passer d'un transform à l'autre grace 
    // au rapport de la taille de la planète et la taille de l'image
    const minLightTransform = {x: 0.85, y: 0.85};
    const maxLightTransform = {x: 0.98, y: 0.98};
    const lightTransform = {
      x: minLightTransform.x + (maxLightTransform.x - minLightTransform.x) * (1 - planetSizeRatio), // LERP
      y: minLightTransform.y + (maxLightTransform.y - minLightTransform.y) * (1 - planetSizeRatio)
    };
    
    let lightPosition = {
      x: Math.round(imageMiddle.x * lightTransform.x), 
      y: Math.round(imageMiddle.y * lightTransform.y)
    };

    // RING

    let ringPosition = {
      x: imageMiddle.x, 
      y: imageMiddle.y
    };

    let ringSize = {
      width: 350 * planetSizeRatio,
      height: 100 * planetSizeRatio
    };

    let ringColor = { // [0.0, 1.0]
      r: 0.5,
      g: 0.5,
      b: 0.5
    }

    const ringRotation = Math.PI / 5; // Radians
    let ringAlpha = 0.6; // [0.0, 1.0]

    let noisePlanetZoom = 220 * planetSizeRatio; // keep the noise generation always at the same scale
    const noiseRingZoom = 150 * planetSizeRatio;

    let hasRing = this.configs.hasRing ?? false; // à définir
    let hasAthmosphere = this.configs.hasAthmosphere ?? true;
    let hasClouds = this.configs.hasClouds ?? true;

    const DEFAULT_COLORS_ATHMOSPHERE = [
      {r: 255, g: 255, b: 255},
      {r: 255, g: 255, b: 255},
    ];

    const DEFAULT_COLORS_PLANET = [
      {r: 255, g: 255, b: 255},
      {r: 255, g: 255, b: 255},
    ];

    let atmosphereMaxAlpha = 1;
    let atmosphereBorderWidthOuter = this.configs.atmosphereBorderWidthOuter || 8; // [0, Number.MAX_VALUE]
    let atmosphereBorderWidthInner = this.configs.atmosphereBorderWidthInner ||50; // [0, Number.MAX_VALUE]

    // To avoid hard borders (anti-aliasing)
    let borderWidth = 5; // [0, Number.MAX_VALUE]

    // Parameters definition

    let configDefaultWorley = {
      algorithm: NoiseGenerator.algorithm.Worley,
      applyOctaves: false,
      formatParametersCallback: function (x, y, z) {
        return {
          x: x - Math.round(Math.round(imageWidth/2)-planetRadius-borderWidth)+5,
          y: y - Math.round(Math.round(imageHeight/2)-planetRadius-borderWidth)+5,
          z: z
        }
      },
      worleySize: Math.round(borderWidth*2 + planetRadius*2),
      worleyRenderImageCallback: function (e, m) {
        return e(1) - e(2); 
      }
    };

    let configDefaultSimplex = {
      algorithm: NoiseGenerator.algorithm.Simplex,
      applyOctaves: true,
      formatParametersCallback: function (x, y, z) {
        return {
          x: x/noisePlanetZoom,
          y: y/noisePlanetZoom,
          z: z
        }
      }
    };

    // Parameters selection
    let selectedcloudsNoiseGeneratorConfig = Object.assign({}, configDefaultSimplex);
    selectedcloudsNoiseGeneratorConfig.octavesExponent = 2;
    selectedcloudsNoiseGeneratorConfig.applyOctaves = true;
    
    let selectedColors = this.configs.planetColors || DEFAULT_COLORS_PLANET;
    let selectedAtmosphereColors = this.configs.athmosphereColors || DEFAULT_COLORS_ATHMOSPHERE;

    let selectedNoiseGeneratorConfig = Object.assign({}, configDefaultSimplex);

    selectedNoiseGeneratorConfig.applyOctaves = this.configs.planetAlgorithmOctave ?? true;
    selectedNoiseGeneratorConfig.nbrFreqs = this.configs.planetAlgorithmOctaveQuantity || 5;
    selectedNoiseGeneratorConfig.octavesExponent = this.configs.planetAlgorithmOctaveExponent || 1.0;
    
    if (this.configs.planetAlgorithm == "Worley Noise") {
      selectedNoiseGeneratorConfig = Object.assign({}, configDefaultWorley);
      selectedNoiseGeneratorConfig.worleyNumPoints = this.configs.planetAlgorithmWorleyCellNbr || 100;
    }
    
    genTimes.initOthers = utils.timeEnd("init");
    console.log(selectedNoiseGeneratorConfig);

    utils.time("init-gradients");
    let gradient = this.#createGradient(selectedColors, 300);
    let gradientAtmosphere = this.#createGradient(selectedAtmosphereColors, 300);
    genTimes.initGradient = utils.timeEnd("init-gradients");

    utils.time("init-algorithm");
    let planetNoiseGenerator = new NoiseGenerator(selectedNoiseGeneratorConfig);
    let cloudsNoiseGenerator = new NoiseGenerator(selectedcloudsNoiseGeneratorConfig);
    let ringNoiseGenerator = new NoiseGenerator(configDefaultSimplex);
    genTimes.initAlgorithm = utils.timeEnd("init-algorithm");

    utils.time("init-empty-image");
    Jimp.create(imageWidth, imageHeight)
    .then(image => {
      genTimes.initEmptyImage = utils.timeEnd("init-empty-image");
      genTimes.init = utils.timeEnd("init");

      utils.time("drawing-image");

      for (let x = 0; x < imageWidth; x++) {
        for (let y = 0; y < imageHeight; y++) {
          utils.time("planet");
          // Current pixel at [x,y]
          let pixel = {
            r: 0.0, // [0.0, 1.0]
            g: 0.0, // [0.0, 1.0]
            b: 0.0, // [0.0, 1.0]
            a: 0.0, // [0.0, 1.0]
            light: 1.0, // [0.0, 1.0]
            edited: false,

            getRed() {
              return this.r * this.light * CHANNEL_MAX_VALUE;
            },
            getGreen() {
              return this.g * this.light * CHANNEL_MAX_VALUE;
            },
            getBlue() {
              return this.b * this.light * CHANNEL_MAX_VALUE;
            },
            getAlpha() {
              return this.a * CHANNEL_MAX_VALUE;
            }
          };


          // Apply the light
          let pixelDistanceLightCenter = this.#getDistance(x, y, lightPosition.x, lightPosition.y);

          let ratioDistanceLight = (pixelDistanceLightCenter / planetRadius) / 1.12;
          //pixel.light = 1 - ratioDistanceLight;
          pixel.light = Math.sqrt(0.5**2-(ratioDistanceLight/2)**(2)) / 0.5 || 0;
          pixel.light = Math.pow(pixel.light, 2.5);

          //
          // PLANET
          //
          let pixelDistancePlanet = this.#getDistance(x, y, planetPosition.x, planetPosition.y);

          // If the pixel is in the planet draw
          if (pixelDistancePlanet <= planetRadius + borderWidth) {

            // Apply the selected gradient
            utils.time("planet-noise");
            let noise = planetNoiseGenerator.getNoiseAt(x, y, 1)
            genTimes.drawImagePlanetAlgorithm = (genTimes.drawImagePlanetAlgorithm || 0) + utils.timeEnd("planet-noise");

            utils.time("planet-gradient");
            let color = this.#lerpGradient(gradient, noise || 0);
            genTimes.drawImagePlanetGradient = (genTimes.drawImagePlanetGradient || 0) + utils.timeEnd("planet-gradient");

            // Apply the gradient's colors to the current pixel
            pixel.r = color.r;
            pixel.g = color.g;
            pixel.b = color.b;

            // Anti-aliasing
            utils.time("planet-aliasing");
            let ratioBorder = 1 - (pixelDistancePlanet - planetRadius) / borderWidth;
            pixel.a = planetAlpha * ratioBorder;
            genTimes.drawImagePlanetAliasing = (genTimes.drawImagePlanetAliasing || 0) + utils.timeEnd("planet-aliasing");

            if (pixelDistancePlanet <= planetRadius) {
              pixel.a = planetAlpha;

              //
              // CLOUDS
              //
              if (hasClouds) {
                utils.time("atmosphere-clouds");
                let cloudNoise = cloudsNoiseGenerator.getNoiseAt(x*3, y*3, 1);
                genTimes.drawImageAtmosphereCloudsAlgorithm = (genTimes.drawImageAtmosphereCloudsAlgorithm || 0) + utils.timeEnd("atmosphere-clouds");
                
                utils.time("atmosphere-clouds-add");
                let newAlpha = pixel.a + cloudNoise * (1 - pixel.a);
                pixel.r = (cloudNoise + pixel.r * pixel.a * (1 - cloudNoise)) / newAlpha;
                pixel.g = (cloudNoise + pixel.g * pixel.a * (1 - cloudNoise)) / newAlpha;
                pixel.b = (cloudNoise + pixel.b * pixel.a * (1 - cloudNoise)) / newAlpha;
                
                pixel.a = newAlpha;
                genTimes.drawImageAtmosphereCloudsAdd = (genTimes.drawImageAtmosphereCloudsAdd || 0) + utils.timeEnd("atmosphere-clouds-add");
              }

            }

            pixel.edited = true;
          }

          // Limit the darkness
          pixel.light = Math.max(pixel.light, 0.05);
          
          genTimes.drawImagePlanet = (genTimes.drawImagePlanet || 0) + utils.timeEnd("planet");

          //
          // ATHMOSPHERE
          //
          if (hasAthmosphere) {
            utils.time("atmosphere");

            if (pixelDistancePlanet <= planetRadius + atmosphereBorderWidthOuter && pixelDistancePlanet > planetRadius - atmosphereBorderWidthInner) {
              // athmosphereMaxAlpha

              let ratioAthmospherBorder = 1 - (pixelDistancePlanet - planetRadius) / atmosphereBorderWidthOuter;
              let pixelAlphaAthmosphere = atmosphereMaxAlpha * ratioAthmospherBorder;
              //console.log((pixelDistancePlanet - planetRadius) / athmosphereBorderWidth);

              utils.time("atmosphere-gradient");
              let athmosphereColor = this.#lerpGradient(gradientAtmosphere, pixelAlphaAthmosphere || 0);
              genTimes.drawImageAtmosphereGradient = (genTimes.drawImageAtmosphereGradient || 0) + utils.timeEnd("atmosphere-gradient");

              utils.time("atmosphere-add");
              if (pixelDistancePlanet <= planetRadius) {
                ratioAthmospherBorder = Math.pow(1 - Math.abs(Math.abs(pixelDistancePlanet - atmosphereBorderWidthInner - planetRadius) / atmosphereBorderWidthInner - 1), 2);
                pixelAlphaAthmosphere = atmosphereMaxAlpha * ratioAthmospherBorder;

                let newAlpha = pixel.a + pixelAlphaAthmosphere * (1 - pixel.a);
                pixel.r = (athmosphereColor.r * pixelAlphaAthmosphere + pixel.r * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                pixel.g = (athmosphereColor.g * pixelAlphaAthmosphere + pixel.g * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                pixel.b = (athmosphereColor.b * pixelAlphaAthmosphere + pixel.b * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                
                pixel.a = newAlpha;
              }
              else {
                let newAlpha = pixel.a + pixelAlphaAthmosphere * (1 - pixel.a);
                pixel.r = (athmosphereColor.r * pixelAlphaAthmosphere + pixel.r * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                pixel.g = (athmosphereColor.g * pixelAlphaAthmosphere + pixel.g * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                pixel.b = (athmosphereColor.b * pixelAlphaAthmosphere + pixel.b * pixel.a * (1 - pixelAlphaAthmosphere)) / newAlpha;
                
                pixel.a = newAlpha;
              }

              if (!pixel.edited) {
                pixel.r = athmosphereColor.r;
                pixel.g = athmosphereColor.g;
                pixel.b = athmosphereColor.b;
                pixel.a = pixelAlphaAthmosphere;
              }
              genTimes.drawImageAtmosphereAdd = (genTimes.drawImageAtmosphereAdd || 0) + utils.timeEnd("atmosphere-add");
              
              pixel.edited = true;
            }

            genTimes.drawImageAtmosphere = (genTimes.drawImageAtmosphere || 0) + utils.timeEnd("atmosphere");
          }


          //
          // RINGS
          //
          if (hasRing) {
            utils.time("ring");
            // @TODO: simplifier la methode
            let pixelRing = this.#getDistanceEllipse(x, y, ringPosition.x, ringPosition.y, ringSize.width, ringSize.height, ringRotation);
            
            let pixelDistanceRing = pixelRing[0];
            let pixelInFirstHalf = pixelRing[1];
            // simplifier la methode
            genTimes.drawImageRingCalc = (genTimes.drawImageRingCalc || 0) + utils.timeEnd("ring");

            let borderDistance = borderWidth / 60;

            if (pixelDistanceRing <= 1 + borderDistance && pixelDistanceRing >= 0.5 - borderDistance) {
              utils.time("ring-aliasing");
              // Ring's anti-aliasing
              let pixelRatioDistanceOuterBorder = 1.0
              let pixelRatioDistanceInnerBorder = 1.0

              if (pixelDistanceRing > 1) {
                pixelRatioDistanceOuterBorder = 1 - (pixelDistanceRing - 1) / borderDistance;
              }
              else if (pixelDistanceRing < 0.5) {
                pixelRatioDistanceInnerBorder = 1 - (0.5 - pixelDistanceRing) / borderDistance;
              }

              let pixelRatioDistanceBorder = pixelRatioDistanceOuterBorder * pixelRatioDistanceInnerBorder;
              genTimes.drawImageRingAliasing = (genTimes.drawImageRingAliasing || 0) + utils.timeEnd("ring-aliasing");

              // Drawing
              utils.time("ring-noise");
              // @TODO: Modifier ce block car trop brouillon
              let ringNoise = ringNoiseGenerator.getNoiseAt(x, y, pixelDistanceRing*10);
              let ringNoise2 = ringNoiseGenerator.getNoiseAt(x+5, y+5, pixelDistanceRing*10+5);
              let ringNoise3 = ringNoiseGenerator.getNoiseAt(x+10, y+10, pixelDistanceRing*10+10);

              let ringNoiseAlpha = ringNoiseGenerator.getNoiseAt(x+15, y+15, pixelDistanceRing*10+15);
              genTimes.drawImageRingNoise = (genTimes.drawImageRingNoise || 0) + utils.timeEnd("ring-noise");

              let ringGradientcolor = this.#lerpGradient(gradient, ringNoise || 0);
              let ringGradientcolor2 = this.#lerpGradient(gradient, ringNoise2 || 0);
              let ringGradientcolor3 = this.#lerpGradient(gradient, ringNoise3 || 0);

              ringColor.r = 0.3 * ringGradientcolor.r;
              ringColor.g = 0.3 * ringGradientcolor2.g;
              ringColor.b = 0.3 * ringGradientcolor3.b;

              ringAlpha = ringNoiseAlpha;
              // jusqu'à ici

              utils.time("ring-add");
              // @TODO: Corriger bug de l'anneau avec l'atmosphère
              if (pixelInFirstHalf) { // First half of the ellipse
                // If the planet already edited the current pixel
                if (pixel.edited) {
                  // Combine the planet pixel with the ring
                  let newAlpha = pixel.a + ringAlpha * pixelRatioDistanceBorder * (1 - pixel.a);
                  pixel.r = (ringColor.r * ringAlpha * pixelRatioDistanceBorder + pixel.r * pixel.light * pixel.a * (1 - ringAlpha * pixelRatioDistanceBorder)) / newAlpha;
                  pixel.g = (ringColor.g * ringAlpha * pixelRatioDistanceBorder + pixel.g * pixel.light * pixel.a * (1 - ringAlpha * pixelRatioDistanceBorder)) / newAlpha;
                  pixel.b = (ringColor.b * ringAlpha * pixelRatioDistanceBorder + pixel.b * pixel.light * pixel.a * (1 - ringAlpha * pixelRatioDistanceBorder)) / newAlpha;
                  pixel.a = newAlpha;

                  pixel.light = 1.0;
                }
                else {
                  // Draws the ring
                  pixel.r = ringColor.r;
                  pixel.g = ringColor.g;
                  pixel.b = ringColor.b;
                  pixel.a = ringAlpha * pixelRatioDistanceBorder;
                }
              }
              else { // Second half of the ellipse
                if (pixel.edited) {
                  // Passage of the ring through the planet's anti-aliasing
                  if (pixelDistancePlanet <= planetRadius + borderWidth && pixelDistancePlanet > planetRadius) {
                    // Combine the planet pixel with the ring
                    let newAlpha = pixel.a + ringAlpha * pixelRatioDistanceBorder * (1 - pixel.a);
                    pixel.r = (pixel.r * pixel.light * pixel.a + ringColor.r * ringAlpha * pixelRatioDistanceBorder * (1 - pixel.a)) / newAlpha;
                    pixel.g = (pixel.g * pixel.light * pixel.a + ringColor.g * ringAlpha * pixelRatioDistanceBorder * (1 - pixel.a)) / newAlpha;
                    pixel.b = (pixel.b * pixel.light * pixel.a + ringColor.b * ringAlpha * pixelRatioDistanceBorder * (1 - pixel.a)) / newAlpha;
                    pixel.a = newAlpha;

                    pixel.light = 1.0;
                  }
                }
                else {
                  // Draws the ring
                  pixel.r = ringColor.r;
                  pixel.g = ringColor.g;
                  pixel.b = ringColor.b;
                  pixel.a = ringAlpha * pixelRatioDistanceBorder;
                }
              }
              genTimes.drawImageRingAdd = (genTimes.drawImageRingAdd || 0) + utils.timeEnd("ring-add");

              pixel.edited = true;
            }

            genTimes.drawImageRing = (genTimes.drawImageRing || 0) + utils.timeEnd("ring");
          }

          // Draws the pixel in the image if the pixel has been edited
          if (!pixel.edited) continue;
          
          let colorInt = Jimp.rgbaToInt(pixel.getRed(), pixel.getGreen(), pixel.getBlue(), pixel.getAlpha());

          image.setPixelColor(colorInt, x, y);
        }
      }
      genTimes.drawImage = utils.timeEnd("drawing-image");

      utils.time("image-write");
      image.write(filePath, function () {
        genTimes.imageWrite = utils.timeEnd("image-write");
        genTimes.total = utils.timeEnd("total");
        console.timeEnd("total");

        genTimes.drawImagePlanet -= genTimes.drawImageAtmosphereCloudsAlgorithm + genTimes.drawImageAtmosphereCloudsAdd;
        genTimes.drawImageAtmosphere += genTimes.drawImageAtmosphereCloudsAlgorithm + genTimes.drawImageAtmosphereCloudsAdd;

        let allTimes = [
          genTimes.init,
          genTimes.initAlgorithm,
          genTimes.initGradient,
          genTimes.initEmptyImage,
          genTimes.initOthers,

          genTimes.drawImage,
          genTimes.drawImagePlanet,
          genTimes.drawImagePlanetAlgorithm,
          genTimes.drawImagePlanetGradient,
          genTimes.drawImagePlanetAliasing,

          genTimes.drawImageAtmosphere,
          genTimes.drawImageAtmosphereGradient,
          genTimes.drawImageAtmosphereAdd,

          genTimes.drawImageAtmosphereCloudsAlgorithm + genTimes.drawImageAtmosphereCloudsAdd,
          genTimes.drawImageAtmosphereCloudsAlgorithm,
          genTimes.drawImageAtmosphereCloudsAdd,

          genTimes.drawImageRing,
          genTimes.drawImageRingCalc,
          genTimes.drawImageRingAliasing,
          genTimes.drawImageRingNoise,
          genTimes.drawImageRingAdd,

          genTimes.imageWrite,

          genTimes.total
        ];

        callback("test", allTimes);
      }); 
    });

    

  }
}

module.exports = {
  PlanetImage: PlanetImage
}