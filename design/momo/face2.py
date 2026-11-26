from PIL import Image
import numpy as np, cv2, json
f=np.array(Image.open('dessin-visage.png').convert('RGBA'))
lab=np.load('facelab.npy')
man=json.load(open('out/momo.json'))
S=0.5
def save(name,ids):
    m=np.isin(lab,ids)
    yy,xx=np.where(m); x0,y0,x1,y1=xx.min()-2,yy.min()-2,xx.max()+3,yy.max()+3
    L=np.zeros_like(f); L[m]=f[m]
    im=Image.fromarray(L[y0:y1,x0:x1]).resize((round((x1-x0)*S),round((y1-y0)*S)),Image.LANCZOS)
    im.save(f'out/{name}.png')
    man['calques'][name]={'x':round(x0*S),'y':round(y0*S),'pivot':[round((x0+x1)/2*S),round((y0+y1)/2*S)]}
save('oeilG',[2]); save('oeilD',[1]); save('bouche',[3,4,5])
man['visage']=['bouche','oeilG','oeilD']
json.dump(man,open('out/momo.json','w'),indent=1)
