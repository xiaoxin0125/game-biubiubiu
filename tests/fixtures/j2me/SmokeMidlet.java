// SPDX-License-Identifier: CC0-1.0
// Reference source for smokeJar.js, which emits equivalent Java 45.3 bytecode.
import javax.microedition.midlet.MIDlet;
import javax.microedition.lcdui.*;
public class SmokeMidlet extends MIDlet {
  public void startApp() { Display.getDisplay(this).setCurrent(new SmokeCanvas()); }
  public void pauseApp() {}
  public void destroyApp(boolean unconditional) {}
}
class SmokeCanvas extends Canvas {
  int color = 255;
  public void paint(Graphics g) { g.setColor(color); g.fillRect(0, 0, 240, 320); }
  public void keyPressed(int key) { color = 255 << 8; repaint(); }
  public void keyReleased(int key) { color = 255 << 16; repaint(); }
}
