"""
sumo/xor_test.py - the smallest neural network that does something impossible
for a straight line, so you can see what "learning" actually is.

RUN
    python sumo/xor_test.py

XOR is the classic example: output 1 when exactly one input is 1.

    0,0 -> 0        0,1 -> 1        1,0 -> 1        1,1 -> 0

You cannot draw a single straight line that separates the 1s from the 0s. That
is the whole reason hidden layers exist: the first layer bends the space, the
second layer can then separate it with a line.

Watch the loss fall and the four outputs move toward 0, 1, 1, 0. When that
makes sense, the traffic model in train_dqn.py is the same four lines with a
harder question attached.
"""

import torch
import torch.nn as nn


class TinyNet(nn.Module):
    def __init__(self):
        super().__init__()
        # Two inputs -> eight hidden units -> one output.
        # ReLU is what makes it non-linear; without it, stacking layers just
        # gives you another straight line and XOR stays impossible.
        self.net = nn.Sequential(
            nn.Linear(2, 8), nn.ReLU(),
            nn.Linear(8, 1),
        )

    def forward(self, x):
        return self.net(x)


def main():
    torch.manual_seed(0)

    X = torch.tensor([[0., 0.], [0., 1.], [1., 0.], [1., 1.]])
    y = torch.tensor([[0.], [1.], [1.], [0.]])

    model = TinyNet()
    opt = torch.optim.Adam(model.parameters(), lr=0.05)
    loss_fn = nn.MSELoss()

    print("Before training:", [round(v, 2) for v in model(X).flatten().tolist()])
    print("(random numbers - it knows nothing yet)\n")

    for epoch in range(2000):
        pred = model(X)              # 1. the guess
        loss = loss_fn(pred, y)      # 2. how wrong it was
        opt.zero_grad()
        loss.backward()              # 3. which way to nudge every weight
        opt.step()                   # 4. nudge them

        if epoch % 400 == 0:
            print("epoch %4d   loss %.4f" % (epoch, loss.item()))

    print("\nAfter training:", [round(v, 2) for v in model(X).flatten().tolist()])
    print("Target was:     [0.0, 1.0, 1.0, 0.0]")

    print("""
What just happened, in one sentence each:

  model(X)          the network guessed an answer for all four inputs
  loss_fn(pred, y)  we measured how far off it was
  loss.backward()   calculus worked out, for every single weight inside, which
                    direction would make the error smaller
  opt.step()        every weight moved a small step in that direction

Two thousand repetitions of that is all training is. The traffic controller in
train_dqn.py uses exactly these four lines - the only difference is that nobody
hands it the right answer, so it has to build one out of the reward it saw and
its own estimate of the future. That is the line marked "the Bellman target".
""")


if __name__ == "__main__":
    main()
