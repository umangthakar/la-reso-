import sharp from 'sharp';

const image = await sharp('public/images/enter-button.png')
  .removeAlpha()
  .toBuffer();

// Get raw pixel data
const { data, info } = await sharp(image)
  .raw()
  .toBuffer({ resolveWithObject: true });

// Create new buffer with alpha channel
const newData = Buffer.alloc(info.width * info.height * 4);

for (let i = 0; i < info.width * info.height; i++) {
  const r = data[i * 3];
  const g = data[i * 3 + 1];
  const b = data[i * 3 + 2];

  // If pixel is close to white/grey (checkerboard) make it transparent
  const isBackground = r > 200 && g > 200 && b > 200;

  newData[i * 4] = r;
  newData[i * 4 + 1] = g;
  newData[i * 4 + 2] = b;
  newData[i * 4 + 3] = isBackground ? 0 : 255;
}

await sharp(newData, {
  raw: { width: info.width, height: info.height, channels: 4 }
})
  .png()
  .toFile('public/images/enter-button-clean.png');

console.log('Done!');
