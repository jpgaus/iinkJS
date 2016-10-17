import { recognizerLogger as logger } from '../../../configuration/LoggerConfig';
import MyScriptJSConstants from '../../../configuration/MyScriptJSConstants';
import * as InkModel from '../../../model/InkModel';
import * as StrokeComponent from '../../../model/StrokeComponent';
import * as CryptoHelper from '../../CryptoHelper';
import * as NetworkInterface from '../../networkHelper/rest/networkInterface';
import cloneJSObject from '../../../util/Cloner';

export function getAvailableRecognitionSlots() {
  const availableRecognitionTypes = {};
  availableRecognitionTypes[MyScriptJSConstants.RecognitionSlot.ON_PEN_UP] = true;
  availableRecognitionTypes[MyScriptJSConstants.RecognitionSlot.ON_DEMAND] = true;
  availableRecognitionTypes[MyScriptJSConstants.RecognitionSlot.ON_TIME_OUT] = true;
  return availableRecognitionTypes;
}

export function getType() {
  return MyScriptJSConstants.RecognitionType.ANALYZER;
}

export function getProtocol() {
  return MyScriptJSConstants.Protocol.REST;
}

/**
 * Internal function to build the payload to ask for a recognition.
 * @param paperOptions
 * @param model
 * @param analyzerInstanceId
 * @returns {{applicationKey: string}}
 * @private
 */
function buildInput(paperOptions, model, analyzerInstanceId) {
  const data = {
    applicationKey: paperOptions.recognitionParams.server.applicationKey,
    instanceId: analyzerInstanceId
  };

  const analyzerInput = {
    parameter: {
      // FIXME Manage the various parameters
      textParameter: {
        textProperties: {},
        language: 'en_US',
        textInputMode: MyScriptJSConstants.InputMode.CURSIVE
      }
    },
    components: []
  };

  // As Rest Text recognition is non incremental wa add the already recognized strokes
  model.recognizedStrokes.forEach((stroke) => {
    analyzerInput.components.push(StrokeComponent.toJSON(stroke));
  });

  // We add the pending strokes to the model
  InkModel.extractNonRecognizedStrokes(model).forEach((stroke) => {
    analyzerInput.components.push(StrokeComponent.toJSON(stroke));
  });

  data.analyzerInput = JSON.stringify(analyzerInput);
  if (paperOptions.recognitionParams.server.hmacKey) {
    data.hmac = CryptoHelper.computeHmac(data.analyzerInput, paperOptions.recognitionParams.server.applicationKey, paperOptions.recognitionParams.server.hmacKey);
  }
  return data;
}

/**
 * Do the recognition
 * @param paperOptionsParam
 * @param modelParam
 * @returns {Promise} Promise that return an updated model as a result
 */
export function recognize(paperOptionsParam, modelParam) {
  const paperOptions = paperOptionsParam;
  const model = modelParam;
  const currentRestAnalyzerRecognizer = this;

  const data = buildInput(paperOptions, modelParam, currentRestAnalyzerRecognizer.analyzerInstanceId);

  // FIXME manage http mode
  return NetworkInterface.post(paperOptions.recognitionParams.server.scheme + '://' + paperOptions.recognitionParams.server.host + '/api/v3.0/recognition/rest/analyzer/doSimpleRecognition.json', data)
      .then(
          // logResponseOnSuccess
          (response) => {
            logger.debug('Cdkv3RestAnalyzerRecognizer success', response);
            return response;
          }
      )
      .then(
          // memorizeInstanceId
          (response) => {
            currentRestAnalyzerRecognizer.analyzerInstanceId = response.instanceId;
            return response;
          }
      )
      .then(
          // updateModel
          (response) => {
            logger.debug('Cdkv3RestAnalyzerRecognizer update model', response);
            model.rawResult = response;
            return model;
          }
      )
      .then(
          // generateRenderingResult
          (modelPromParam) => {
            const mutatedModel = InkModel.clone(modelPromParam);
            const recognizedComponents = {
              strokeList: [],
              symbolList: [],
              inkRange: {}
            };
            // We recopy the recognized strokes to flag them as toBeRemove if they are scratched out or map with a symbol
            const potentialStrokeList = model.recognizedStrokes.concat(InkModel.extractNonRecognizedStrokes(model));
            // TODO Check the wording compare to the SDK doc
            if (mutatedModel.rawResult.result) {
              // Handling text lines
              mutatedModel.rawResult.result.textLines.forEach((textLine) => {
                const mutatedTextLine = cloneJSObject(textLine);
                mutatedTextLine.type = 'textline';
                mutatedTextLine.inkRanges.forEach((inkRange) => {
                  potentialStrokeList[inkRange.stroke].toBeRemove = true;
                });
                // textLine.inkRanges = undefined;
                recognizedComponents.symbolList.push(textLine);
              });
              mutatedModel.rawResult.result.shapes.forEach((shape) => {
                if (shape.candidates && shape.candidates.length > 0 && shape.candidates[0].type !== 'notRecognized') {
                  // Flagging strokes recognized as toBeRemove
                  shape.inkRanges.forEach((inkRange) => {
                    potentialStrokeList.slice(inkRange.firstStroke, inkRange.lastStroke + 1).forEach((stroke) => {
                      stroke.toBeRemove = true;
                    });
                  });
                  // Merging the first candidate with the shape element
                  const newSymbol = Object.assign(shape, shape.candidates[0]);
                  newSymbol.candidates = undefined;
                  recognizedComponents.symbolList.push(newSymbol);
                }
              });
            }
            recognizedComponents.strokeList = potentialStrokeList.filter(stroke => !stroke.toBeRemove);
            recognizedComponents.inkRange.firstStroke = 0;
            recognizedComponents.inkRange.lastStroke = model.recognizedStrokes.length;
            mutatedModel.recognizedComponents = recognizedComponents;
            mutatedModel.recognizedStrokes = mutatedModel.recognizedStrokes.concat(InkModel.extractNonRecognizedStrokes(mutatedModel));
            logger.debug('Building the rendering model', mutatedModel);
            return mutatedModel;
          }
  );
}