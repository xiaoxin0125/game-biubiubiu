// CC0 source reference for smokeJar({ serviceRepaints: true }).
// This waits for an asynchronously suspended paint via serviceRepaints(),
// then switches black to blue. A no-op serviceRepaints freezes its Java loop.
import javax.microedition.lcdui.*;
class RepaintSmokeCanvas extends Canvas implements Runnable {
    int color, painted;
    protected void showNotify() { new Thread(this).start(); }
    public void run() {
        while (painted == 0) { repaint(); serviceRepaints(); }
        color = 255;
        repaint(); serviceRepaints();
    }
    protected void paint(Graphics g) {
        try { Thread.sleep(20); } catch (Exception e) {}
        g.setColor(color); g.fillRect(0, 0, 240, 320);
        painted = 1;
    }
}
