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
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth"
import { authOptions } from './auth/[...nextauth]';
import { WorkflowFormat } from '@prisma/client';

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
  const session = await getServerSession(req, res, authOptions)
  const userId = session ? session.userId : null
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

      // console.log(files, file, file.filepath)
      // return res.status(200).json({"PATH": file.filepath})

      
      
      let buff;
      let request;
      if (file.mimetype == "image/png") {
        buff = fs.readFileSync(file.filepath);
        request = {
          Bucket: process.env.BUCKET_NAME,
          Key: id + ".png",
          ContentType: "image/png",
          ACL: 'public-read',
          Body: buff,
        }
      } else if (file.mimetype == "application/json") {
        const data = fs.readFileSync(file.filepath);
        const compact = JSON.stringify(JSON.parse(data))
        buff = zlib.gzipSync(compact);
        request = {
          Bucket: process.env.BUCKET_NAME,
          Key: id + ".json.gz",
          ContentType: 'application/json',
          ContentEncoding: 'gzip',
          ACL: 'public-read',
          Body: buff,
        }
      } else {
        return res.status(500).json({ error: 'Unknown format.' });
      }
      //Creating DB entry before uploading to S3, so upload fails when ID collisions occur
      const workflow = await prisma.workflow.create({
        data: {
          id,
          user_id: userId,
          format: file.mimetype == "image/png" ? WorkflowFormat.PNG : WorkflowFormat.JSON,
          size: Buffer.byteLength(buff)
        }
      })
      const resp = await S3.send(new PutObjectCommand(request));

      return res.status(200).json({ status: `success`, id: id });
    });

  } catch (error) {
    console.error('An error occurred:', error);
    return res.status(500).json({ error: 'An error occurred.' });
  }

  // res.status(200).json({id})
}
