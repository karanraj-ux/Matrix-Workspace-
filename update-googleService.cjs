const fs = require('fs');
let content = fs.readFileSync('src/services/googleService.ts', 'utf8');
if (!content.includes('export const makeFilePublic')) {
    content += `\nexport const makeFilePublic = async (fileId: string, accessToken: string) => {
  await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}/permissions\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${accessToken}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    })
  });
};
`;
    fs.writeFileSync('src/services/googleService.ts', content, 'utf8');
}
