import { recognizerLogger as logger } from '../configuration/LoggerConfig';
import * as InkModel from './InkModel';

/**
 * Recognizer context
 * @typedef {Object} RecognizerContext
 * @property {Array<RecognitionContext>} recognitionContexts
 * @property {Promise} initPromise
 * @property {RecognitionPositions} lastRecognitionPositions  Last recognition sent/received stroke indexes.
 * @property {String} url
 * @property {String} suffixUrl
 * @property {WebSocket} websocket
 * @property {Options} options
 * @property {function} callback
 * @property {Number} currentReconnectionCount
 * @property {String} instanceId
 */

/**
 * Create a new recognizer context
 * @return {RecognizerContext} An object that contains all recognizer context
 */
export function createEmptyRecognizerContext() {
  return {
    // websocket
    recognitionContexts: [],
    initPromise: undefined,
    lastRecognitionPositions: {
      lastSentPosition: -1,
      lastReceivedPosition: -1
    },
    url: undefined,
    suffixUrl: undefined,
    websocket: undefined,
    options: undefined,
    callback: undefined,
    currentReconnectionCount: undefined,
    instanceId: undefined
  };
}

export function isResetRequired(recognizerContext, model) {
  if (recognizerContext.lastRecognitionPositions) {
    return recognizerContext.lastRecognitionPositions.lastSentPosition >= model.rawStrokes.length - 1;
  }
  return false;
}

/**
 * Update the recognition context positions
 * @param {RecognizerContext} recognizerContext Current recognizer context
 * @param {Model} model Current model
 * @return {RecognizerContext}
 */
export function updateRecognitionPositions(recognizerContext, model) {
  const recognizerContextRef = recognizerContext;
  recognizerContextRef.lastRecognitionPositions.lastSentPosition = model.lastRecognitionPositions.lastSentPosition;
  recognizerContextRef.lastRecognitionPositions.lastReceivedPosition = model.lastRecognitionPositions.lastReceivedPosition;
  return recognizerContextRef;
}

/**
 * Test if it should attempt immediate reconnect
 * @param {RecognizerContext} recognizerContext
 * @return {Boolean} True if should attempt reconnect, false otherwise
 */
export function shouldAttemptImmediateReconnect(recognizerContext) {
  const recognizerContextRef = recognizerContext;
  return recognizerContextRef.websocket.autoReconnect === true && recognizerContextRef.currentReconnectionCount++ <= recognizerContextRef.websocket.maxRetryCount;
}

/**
 * Lost connection message
 * @type {{type: string}}
 */
export const LOST_CONNEXION_MESSAGE = { type: 'LOST_CONNECTION' };

