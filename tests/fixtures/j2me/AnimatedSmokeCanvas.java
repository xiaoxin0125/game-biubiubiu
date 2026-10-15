// SPDX-License-Identifier: CC0-1.0
// Animated variant emitted by smokeJar({ animated: true }).
// Its MIDlet is the same as SmokeMidlet.java; this replaces the Canvas class.
import javax.microedition.lcdui.*;
class AnimatedSmokeCanvas extends Canvas implements Runnable {
  int color;
  AnimatedSmokeCanvas() { new Thread(this).start(); }
  public void paint(Graphics g) { g.setColor(color); g.fillRect(0, 0, 240, 320); }
  public void keyPressed(int key) { color = 255 << 8; repaint(); }
  public void keyReleased(int key) { color = 255 << 16; repaint(); }
  public void run() {
    while (true) {
      color++;
      repaint();
      try { Thread.sleep(100); } catch (InterruptedException ignored) {}
    }
  }
}
