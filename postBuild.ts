import fs from 'node:fs/promises';

console.info('postBuild. Coping files');
console.time('postBuild. Done');

const paths = ['resources', 'templates', 'types.d.ts'];

const promises = paths.map((path) => {
  fs.cp(`./src/${path}`, `./dist/${path}`, { recursive: true });
});
const result = await Promise.all(promises);

console.timeEnd('postBuild. Done');
