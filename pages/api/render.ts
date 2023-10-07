// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
const fs = require('fs');

function readStream(input) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    input.on('data', chunk => chunks.push(chunk));
    input.on('end', () => resolve(Buffer.concat(chunks)));
    input.on('error', reject);
  });
}

async function getPngMetadata(input) {
  const pngData = await readStream(input);

  const dataView = new DataView(pngData.buffer);

  if (dataView.getUint32(0) !== 0x89504e47) {
    console.error("Not a valid PNG file");
    return;
  }

  let offset = 8;
  let txtChunks = {};

  while (offset < pngData.length) {
    const length = dataView.getUint32(offset);
    const type = String.fromCharCode(...pngData.slice(offset + 4, offset + 8));

    if (type === "tEXt") {
      let keywordEnd = offset + 8;

      while (pngData[keywordEnd] !== 0) {
        keywordEnd++;
      }

      const keyword = String.fromCharCode(...pngData.slice(offset + 8, keywordEnd));
      const contentArraySegment = pngData.slice(keywordEnd + 1, offset + 8 + length);
      const contentJson = Array.from(contentArraySegment).map(s => String.fromCharCode(s)).join('');
      txtChunks[keyword] = contentJson;
    }

    offset += 12 + length;
  }

  return txtChunks;
}


const zlib = require('zlib');
import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;
  let url = `https://r2.comfy.icu/${id}.png`
  let obj;
  try {
    obj = await S3.send(new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: id + ".png"
    }));
  } catch (e) {
    try {
      obj = await S3.send(new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: id + ".json.gz"
      }));
    } catch (e2) {
      return res.status(404).end("Error")
    }
  }

  if (obj === undefined) {
    return res.status(500).end("Sorry, please try refreshing again")
  }

  let comfyJson;
  if (obj.ContentType == "application/json") {
    comfyJson = { workflow: zlib.gunzipSync(await obj.Body?.transformToByteArray()) }
    url = 'https://comfy.icu/comfyui.webp'
  } else {
    comfyJson = await getPngMetadata(obj.Body)
  }

  // console.log(comfyJson)

  res.setHeader('content-type', 'text/html')

  const str = `<!DOCTYPE html>
  <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>ComfyICU</title>

          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="ComfyICU">
          <meta name="twitter:description" content="Imgur for sharing ComfyUI workflows">
          <meta name="twitter:image" content="${url}">
          <meta property="og:title" content="ComfyICU">
          <meta property="og:description" content="Imgur for sharing ComfyUI workflows">
          <meta property="og:image" content="${url}">

          <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
          <link rel="stylesheet" type="text/css" href="/lib/litegraph.css" />
          <link rel="stylesheet" type="text/css" href="/style.css" />
          <script type="text/javascript" src="/lib/litegraph.core.js"></script>
          <script type="module">
              window.defaultGraph = `+ comfyJson.workflow + `;
              import { app } from "/scripts/app.js";
              await app.setup();
              window.app = app;
              window.graph = app.graph;
              window.app.loadGraphData(window.defaultGraph);
          </script>
          <script>

          // Lifted from https://stackoverflow.com/questions/19721439/download-json-object-as-a-file-from-browser
          function downloadObjectAsJson(exportObj, exportName){
            var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj));
            var downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href",     dataStr);
            downloadAnchorNode.setAttribute("download", exportName + ".json");
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
          } 
          </script>
      </head>
      <body>
        <style>
        .container {
          width:100%; max-width:1280px; margin: 0 auto;
        }
        a, a:visited {
          --rgb: 255, 255, 255;
          color: rgba(var(--rgb), 0.5);
          text-decoration: none;
          transition-duration: 0.2s
          transition-property: color;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }
        .blue {
          --rgb: 3, 102, 214;
          color: rgba(var(--rgb), 0.8);
        }
        a:hover { color: rgba(var(--rgb), 1); }

        </style>
        <div style="z-index:1000; position:relative; background: #000">
        <div class="container" style="padding:10px;">
          <a href="/" style="font-weight: 600;"><span class="blue">Comfy</span>.ICU</a>

          <a href="#" style="float:right;" onclick="downloadObjectAsJson(window.defaultGraph, 'workflow');">Download Workflow</a>

          <a href="/" class="blue" style="float:right; margin-right:20px;">Upload</a>
        </div>
        </div>

        <div style="width: 100%; height: 720px;">
          <div class="litegraph">
              <canvas id="graph-canvas" tabindex="1" style="touch-action: none;"></canvas>
          </div>
        </div>

        <div style="z-index:1000; position:relative; background: #000; padding-top:20px; padding-bottom:20px">
          <div class="container" style="text-align:center;">
            <img src="${url}" style="max-width:100%;"/>
          </div>
        </div>
      </body>
  </html>
  `
  res.status(200).end(str)
}
