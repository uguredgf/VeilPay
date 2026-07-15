console.error([
  'VeilPay Compact sources are architecture drafts and are not compiled artifacts.',
  'A real contract build requires the official Compact compiler, supported language syntax,',
  'generated TypeScript bindings, proving keys, and a target-network deployment configuration.',
  'Do not describe this command as a successful contract build until that toolchain is wired.',
].join('\n'));
process.exitCode = 1;
