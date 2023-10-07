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

export async function getWorkflow(id: string) {


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
            throw new Error("Not found")
        }
    }

    if (obj === undefined) {
        throw new Error("Sorry, please try refreshing again")
    }

    let comfyJson;
    if (obj.ContentType == "application/json") {
        comfyJson = { workflow: zlib.gunzipSync(await obj.Body?.transformToByteArray()) }
        comfyJson.url = 'https://comfy.icu/comfyui.webp'
    } else {
        comfyJson = await getPngMetadata(obj.Body)
        comfyJson.url = `https://r2.comfy.icu/${id}.png`
    }
    return comfyJson
}