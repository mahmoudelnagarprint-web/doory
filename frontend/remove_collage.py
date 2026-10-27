import sys
path='src/editor/strings.ts'
with open(path,'r',encoding='utf-8') as f:
    lines=f.readlines()
out=[]
skip=False
for i,line in enumerate(lines):
    if '  collage: {' in line:
        skip=True
        continue
    if skip:
        if line.strip()==='},':
            # peek next line
            if i+1 < len(lines) and 'ctx: {' in lines[i+1]:
                skip=False
                continue
        continue
    out.append(line)
with open(path,'w',encoding='utf-8') as f:
    f.writelines(out)
