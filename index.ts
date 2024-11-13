import amqp from "amqplib";
import { ffmpegToMinio } from "./lib/utils.js";
import { mkdtemp, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import { minioClient } from "./lib/minio.js";

const connection = await amqp.connect(process.env.AMQP_URL!);
const channel = await connection.createChannel();

channel.assertQueue(process.env.AMQP_QUEUE!, { durable: true });
channel.prefetch(1);

console.log("Waiting for messages");
channel.consume(
  process.env.AMQP_QUEUE!,
  async (msg) => {
    if (!msg) return;
    console.log("Received message");
    const tmpdir = await mkdtemp(os.tmpdir() + path.sep);

    try {
      const { videoId, originalKey } = JSON.parse(msg.content.toString());

      const originalPath = path.join(tmpdir, originalKey.split("/").pop()!);
      await minioClient.fGetObject(
        process.env.MINIO_BUCKET!,
        originalKey,
        originalPath
      );

      await Promise.all([
        ffmpegToMinio(
          ffmpeg(originalPath)
            .noVideo()
            .audioCodec("libvorbis")
            .audioBitrate("128k")
            .audioFrequency(48000)
            .outputOptions(["-dash", "1"]),
          tmpdir,
          `${videoId}/audio.webm`
        ),
        ffmpegToMinio(
          ffmpeg(originalPath)
            .videoCodec("libvpx-vp9")
            .outputOptions([
              "-tile-columns",
              "4",
              "-frame-parallel",
              "1",
              "-dash",
              "1",
              "-speed",
              "5",
            ])
            .fps(30)
            .noAudio()
            .videoBitrate("1800k")
            .videoFilter("scale=1920:1080"),
          tmpdir,
          `${videoId}/1920x1080.webm`
        ),
        ffmpegToMinio(
          ffmpeg(originalPath)
            .videoCodec("libvpx-vp9")
            .outputOptions([
              "-tile-columns",
              "4",
              "-frame-parallel",
              "1",
              "-dash",
              "1",
              "-speed",
              "5",
            ])
            .fps(30)
            .noAudio()
            .videoBitrate("1024k")
            .videoFilter("scale=1280:720"),
          tmpdir,
          `${videoId}/1280x720.webm`
        ),
        ffmpegToMinio(
          ffmpeg(originalPath)
            .videoCodec("libvpx-vp9")
            .outputOptions([
              "-tile-columns",
              "4",
              "-frame-parallel",
              "1",
              "-dash",
              "1",
              "-speed",
              "5",
            ])
            .fps(30)
            .noAudio()
            .videoBitrate("276k")
            .videoFilter("scale=640:360"),
          tmpdir,
          `${videoId}/640x630.webm`
        ),
      ]);

      await ffmpegToMinio(
        ffmpeg()
          .input(path.join(tmpdir, "640x360.webm"))
          .inputFormat("webm_dash_manifest")
          .input(path.join(tmpdir, "1280x720.webm"))
          .inputFormat("webm_dash_manifest")
          .input(path.join(tmpdir, "1920x1080.webm"))
          .inputFormat("webm_dash_manifest")
          .input(path.join(tmpdir, "audio.webm"))
          .inputFormat("webm_dash_manifest")
          .outputOptions([
            "-c",
            "copy",
            "-map",
            "0",
            "-map",
            "1",
            "-map",
            "2",
            "-map",
            "3",
            "-f",
            "webm_dash_manifest",
            "-adaptation_sets",
            "id=0,streams=0,1,2 id=1,streams=3",
          ]),
        tmpdir,
        `${videoId}/manifest.mpd`
      );
    } finally {
      channel.ack(msg);
      await rmdir(tmpdir);
    }
  },
  { noAck: false }
);
