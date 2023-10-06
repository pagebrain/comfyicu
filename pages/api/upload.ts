// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
const zlib = require('zlib');

import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand
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

type Data = {
  name: string
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}
import fs from "fs";
import { IncomingForm } from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  // const resp = await S3.send(
  //   new ListObjectsV2Command({ Bucket: process.env.BUCKET_NAME })
  // )
  // const resp = require('crypto').randomBytes(48, function(err, buffer) {
  //   return buffer.toString('base64');
  // });

  try {

    const crypto = require('crypto');
    const id = crypto.randomBytes(getRandomInt(4, 8)).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')


    const form = new IncomingForm({ maxFileSize: 3 * 1024 * 1024 });

    form.parse(req, async function (err, fields, files) {
      if (err) {
        return res.status(500).json({ error: 'An error occurred while processing the upload.' });
      }
      // // Access the uploaded file from files object
      const file = files.file[0];
      // const bytes = await file.arrayBuffer()
      // const buffer = Buffer.from(bytes)

      console.log(files, file, file.filepath)
      // return res.status(200).json({"PATH": file.filepath})

      if (file.mimetype == "image/png") {
        const data = fs.readFileSync(file.filepath);

        // fs.writeFileSync(`${id}.png`, data)
        // console.log(`open ${id}.png to see the uploaded file`)

        // const presignedUrl = await getSignedUrl(S3, new PutObjectCommand({
        //   Bucket: process.env.BUCKET_NAME,
        //   Key: id + ".png",
        //   ContentType: "image/png",
        //   ACL: 'public-read'
        // }), {
        //   expiresIn: 60 * 5 // 5 minutes
        // });

        const presignedUrl = await S3.send(new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: id + ".png",
          ContentType: "image/png",
          ACL: 'public-read',
          Body: data,
        }));

      } else if (file.mimetype == "application/json") {
        const data = fs.readFileSync(file.filepath);
        const compact = JSON.stringify(JSON.parse(data))
        const compressedStringAsBuffer = zlib.gzipSync(compact);

        const presignedUrl = await S3.send(new PutObjectCommand({
          Bucket: process.env.BUCKET_NAME,
          Key: id + ".json.gz",
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
          ACL: 'public-read',
          Body: compressedStringAsBuffer,
        }));
      } else {
        return res.status(500).json({ error: 'Unknown format.' });
      }

      // Do something with the uploaded file, e.g., save it to a database, process it, etc.

      return res.status(200).json({ status: `success`, id: id });
    });

  } catch (error) {
    console.error('An error occurred:', error);
    return res.status(500).json({ error: 'An error occurred.' });
  }

  // res.status(200).json({id})
}
