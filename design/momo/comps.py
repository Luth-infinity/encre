from PIL import Image
import numpy as np, cv2
a=np.array(Image.open('cut.png')).astype(int)
R,G,B,A=[a[...,i] for i in range(4)]
mag=(R>150)&(G<80)&(B>80)   # outline magenta
fill=(A>200)&~mag
n,lab,st,cen=cv2.connectedComponentsWithStats(fill.astype(np.uint8),connectivity=4)
order=np.argsort(-st[:,4])
for i in order[1:40]:
    x,y,w,h,s=st[i]
    if s<300: continue
    col=a[lab==i][:,:3].mean(0).astype(int)
    print(i,'bbox',x,y,x+w,y+h,'area',s,'col',col)
np.save('lab.npy',lab)
