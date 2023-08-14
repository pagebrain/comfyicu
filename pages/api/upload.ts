// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'

import {
  S3Client,
  PutObjectCommand
} from "@aws-sdk/client-s3";

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
      const data = fs.readFileSync(file.filepath);


      const resp = await S3.send(new PutObjectCommand({
        Bucket: process.env.BUCKET_NAME,
        Key: id + ".png",
        ContentType: "image/png",
        ACL: 'public-read',
        Body: data,
      }));

      return res.status(200).json({ status: `success`, id: id });
    });

  } catch (error) {
    console.error('An error occurred:', error);
    return res.status(500).json({ error: 'An error occurred.' });
  }
}
