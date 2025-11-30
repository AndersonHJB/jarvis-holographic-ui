import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export class VisionService {
  private static handLandmarker: HandLandmarker | null = null;
  private static video: HTMLVideoElement | null = null;
  private static lastVideoTime = -1;

  static async initialize() {
    if (this.handLandmarker) return;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }

  static detect(video: HTMLVideoElement) {
    if (!this.handLandmarker) return null;

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      return this.handLandmarker.detectForVideo(video, performance.now());
    }
    return null;
  }
}