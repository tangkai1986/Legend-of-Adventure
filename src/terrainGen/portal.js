module.exports = class Portal {
  constructor(x, y, w, h, destination, destX, destY) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.target = destination;
    this.destX = destX;
    this.destY = destY;
  }

  offset(x, y) {
    return new Portal(
      x + this.x,
      y + this.y,
      this.width,
      this.height,
      this.target,
      this.destX,
      this.destY
    );
  }

  collidingWithEntity({x, y, width, height}) {
    return (
      x + width >= this.x &&
      this.x + this.width >= x &&
      y >= this.y &&
      this.y + this.height >= y - height
    );
  }

  toString() {
    return JSON.stringify({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    });
  }
};
