from PIL import Image
import numpy as np, cv2, json
f=np.array(Image.open('dessin-visage.png').convert('RGB')).astype(int)
g=np.array(Image.open('src.png').convert('RGB')).astype(int)
d=np.abs(f-g).sum(2)>40
d=cv2.dilate(d.astype(np.uint8),np.ones((5,5),np.uint8))>0
n,lab,st,_=cv2.connectedComponentsWithStats(d.astype(np.uint8))
for i in range(1,n):
    x,y,w,h,s=st[i]
    if s>50: print(i,x,y,x+w,y+h,s)
np.save('facelab.npy',lab)
