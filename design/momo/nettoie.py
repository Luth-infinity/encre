from PIL import Image
import numpy as np, cv2
for f in ['front_avec.png','front_sans.png']:
    a=np.array(Image.open(f))
    x0,y0,x1,y1=1470,580,1620,740
    box=a[y0:y1,x0:x1].copy()
    dark=((box[...,:3].max(2)<110)&(box[...,3]>0)).astype(np.uint8)
    thick=cv2.dilate(cv2.erode(dark,np.ones((17,17),np.uint8)),np.ones((21,21),np.uint8))
    thin=cv2.dilate(((dark>0)&(thick==0)).astype(np.uint8),np.ones((5,5),np.uint8))>0
    col=box[...,:3].astype(int)
    kill=thin&(col[...,1]<80)&(col[...,0]<120)
    box[kill]=0
    m=(box[...,3]>0).astype(np.uint8)
    hole=(cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))>0)&(m==0)
    rgb=cv2.inpaint(np.ascontiguousarray(box[...,:3]),(hole|kill).astype(np.uint8)*0+hole.astype(np.uint8),5,cv2.INPAINT_TELEA)
    box[hole,:3]=rgb[hole]; box[hole,3]=255
    a[y0:y1,x0:x1]=box
    Image.fromarray(a).save(f)
im=Image.open('front_avec.png'); v=Image.new('RGBA',im.size,(120,130,140,255)); v.alpha_composite(im); v.crop((1350,450,1750,850)).save('z1.png')
